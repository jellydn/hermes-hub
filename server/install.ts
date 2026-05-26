import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { getAuthSession } from "./auth";
import { getSessionCredential } from "./credentials";
import { decryptSecret } from "./crypto";
import { getDb } from "./db";
import { auditLogs, installs, servers } from "./db/schema";
import { getClientIp } from "./lib/get-client-ip";
import { type SshAuthMethod, SshConnectError, withSshConnection } from "./ssh";

type InstallStatus = "pending" | "running" | "succeeded" | "failed";

type InstallEvent = {
	installId: string;
	serverId: string;
	step: string;
	progress: number;
	message: string;
	status: InstallStatus;
	timestamp: string;
	error?: string;
};

type InstallStep = {
	id: string;
	progress: number;
	message: string;
	command: string;
};

type InstallStreamState = {
	installId: string;
	serverId: string;
	events: InstallEvent[];
	listeners: Set<(event: InstallEvent) => void>;
	status: InstallStatus;
	runId: string;
};

type ServerCredentialRecord = {
	id: string;
	host: string;
	port: number;
	username: string;
	authMethod: string;
	encryptedCredential: string | null;
	storeCredential: boolean;
};

const defaultHermesImage = "ghcr.io/hermes-agent/hermes:latest";

const IDLE_TIMEOUT_MS = 90_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

const installSteps: InstallStep[] = [
	{
		id: "install-docker",
		progress: 15,
		message: "Installing Docker",
		command:
			"sudo apt-get update -y && sudo apt-get install -y ca-certificates curl gnupg && curl -fsSL https://get.docker.com | sudo sh",
	},
	{
		id: "install-compose",
		progress: 30,
		message: "Installing Docker Compose",
		command:
			"sudo apt-get install -y docker-compose-plugin && sudo systemctl enable --now docker",
	},
	{
		id: "create-hermes-directory",
		progress: 45,
		message: "Creating Hermes workspace",
		command: "mkdir -p ~/hermes",
	},
	{
		id: "write-compose-file",
		progress: 60,
		message: "Writing docker-compose.yml",
		command: buildComposeWriteCommand(),
	},
	{
		id: "pull-image",
		progress: 80,
		message: "Pulling Hermes image",
		command: "cd ~/hermes && sudo docker compose pull",
	},
	{
		id: "start-containers",
		progress: 100,
		message: "Starting Hermes containers",
		command: "cd ~/hermes && sudo docker compose up -d",
	},
];

const installStreams = new Map<string, InstallStreamState>();

export async function startServerInstall(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	const db = getDb();
	const serverRecord = await getServerForInstall({
		serverId,
		userId: session.user.id,
	});

	if (!serverRecord) {
		return context.json({ error: "Server not found" }, 404);
	}

	const authMethod = normalizeAuthMethod(serverRecord.authMethod);
	if (!authMethod) {
		return context.json({ error: "Unsupported authentication method" }, 400);
	}

	let credential: string;

	try {
		credential = getInstallCredential({
			server: serverRecord,
			sessionId: session.session.id,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Install credential unavailable";
		return context.json({ error: message }, 400);
	}

	const existingState = installStreams.get(serverId);
	if (existingState?.status === "running") {
		return context.json({ error: "Install already in progress" }, 409);
	}

	const installRecord = await upsertInstallRecord(serverId);
	const state = resetInstallStream(serverId, installRecord.id);
	const ipAddress = getClientIp(context);

	await db.insert(auditLogs).values({
		userId: session.user.id,
		action: "server.install.started",
		details: {
			serverId,
			installId: installRecord.id,
			host: serverRecord.host,
		},
		ipAddress,
	});

	void runInstallWorkflow({
		server: serverRecord,
		authMethod,
		credential,
		userId: session.user.id,
		installId: installRecord.id,
		serverId,
		runId: state.runId,
		ipAddress,
	});

	return context.json(
		{
			install: {
				id: installRecord.id,
				serverId,
				status: "pending",
				step: installSteps[0]?.id ?? "pending",
			},
		},
		202,
	);
}

export async function streamServerInstallEvents(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	const serverRecord = await getServerForInstall({
		serverId,
		userId: session.user.id,
	});
	if (!serverRecord) {
		return context.json({ error: "Server not found" }, 404);
	}

	const state = await ensureInstallStream(serverId);

	return streamSSE(context, async (stream) => {
		// Replay past events
		for (const event of state.events) {
			await stream.writeSSE({
				event: "install-progress",
				data: JSON.stringify(event),
			});
		}

		if (state.status === "succeeded" || state.status === "failed") {
			return;
		}

		// 90-second idle timeout: close the stream if no event is written
		let idleTimer: ReturnType<typeof setTimeout> | null = null;

		function resetIdleTimer() {
			if (idleTimer) {
				clearTimeout(idleTimer);
			}
			idleTimer = setTimeout(() => {
				stream.close();
				resolvePending();
			}, IDLE_TIMEOUT_MS);
		}

		// 30-second heartbeat: keep the connection alive with SSE comments
		const heartbeat = setInterval(async () => {
			try {
				await stream.writeSSE({
					data: ": heartbeat",
				});
			} catch {
				// Stream may be closed; clean up
				clearInterval(heartbeat);
			}
		}, HEARTBEAT_INTERVAL_MS);

		let pendingResolve: (() => void) | null = null;

		function resolvePending() {
			if (pendingResolve) {
				pendingResolve();
				pendingResolve = null;
			}
		}

		await new Promise<void>((resolve) => {
			pendingResolve = resolve;
			resetIdleTimer();

			const listener = async (event: InstallEvent) => {
				resetIdleTimer();

				await stream.writeSSE({
					event: "install-progress",
					data: JSON.stringify(event),
				});

				if (event.status === "succeeded" || event.status === "failed") {
					clearInterval(heartbeat);
					if (idleTimer) {
						clearTimeout(idleTimer);
					}
					state.listeners.delete(listener);
					resolve();
				}
			};

			state.listeners.add(listener);
			stream.onAbort(() => {
				clearInterval(heartbeat);
				if (idleTimer) {
					clearTimeout(idleTimer);
				}
				state.listeners.delete(listener);
				resolve();
			});
		});

		clearInterval(heartbeat);
		if (idleTimer) {
			clearTimeout(idleTimer);
		}
	});
}

async function runInstallWorkflow(input: {
	server: ServerCredentialRecord;
	authMethod: SshAuthMethod;
	credential: string;
	userId: string;
	installId: string;
	serverId: string;
	runId: string;
	ipAddress: string | null;
}) {
	const logLines: string[] = [];

	try {
		await emitInstallEvent({
			installId: input.installId,
			serverId: input.serverId,
			runId: input.runId,
			step: installSteps[0]?.id ?? "pending",
			progress: 0,
			message: "Install queued",
			status: "pending",
			logLines,
		});

		await withSshConnection(
			{
				host: input.server.host,
				port: input.server.port,
				username: input.server.username,
				authMethod: input.authMethod,
				credential: input.credential,
			},
			async (ssh) => {
				for (const step of installSteps) {
					const result = await ssh.execCommand(step.command);

					if (result.code !== 0) {
						throw new Error(result.stderr || `Command failed: ${step.id}`);
					}

					const detail = result.stdout.trim();
					await emitInstallEvent({
						installId: input.installId,
						serverId: input.serverId,
						runId: input.runId,
						step: step.id,
						progress: step.progress,
						message: detail ? `${step.message}: ${detail}` : step.message,
						status: step.progress === 100 ? "succeeded" : "running",
						logLines,
					});
				}
			},
		);

		await getDb()
			.insert(auditLogs)
			.values({
				userId: input.userId,
				action: "server.install.succeeded",
				details: {
					serverId: input.serverId,
					installId: input.installId,
				},
				ipAddress: input.ipAddress,
			});
	} catch (error) {
		const message = normalizeInstallError(error);

		await emitInstallEvent({
			installId: input.installId,
			serverId: input.serverId,
			runId: input.runId,
			step: "failed",
			progress: 100,
			message: "Install failed",
			status: "failed",
			error: message,
			logLines,
		});

		await getDb()
			.insert(auditLogs)
			.values({
				userId: input.userId,
				action: "server.install.failed",
				details: {
					serverId: input.serverId,
					installId: input.installId,
					error: message,
				},
				ipAddress: input.ipAddress,
			});
	}
}

async function emitInstallEvent(input: {
	installId: string;
	serverId: string;
	runId: string;
	step: string;
	progress: number;
	message: string;
	status: InstallStatus;
	error?: string;
	logLines: string[];
}) {
	const state = installStreams.get(input.serverId);
	if (!state || state.runId !== input.runId) {
		return;
	}

	const timestamp = new Date().toISOString();
	const logLine = `${timestamp} [${input.step}] ${
		input.error ? `${input.message}: ${input.error}` : input.message
	}`;
	input.logLines.push(logLine);

	const event: InstallEvent = {
		installId: input.installId,
		serverId: input.serverId,
		step: input.step,
		progress: input.progress,
		message: input.message,
		status: input.status,
		timestamp,
		...(input.error ? { error: input.error } : {}),
	};

	state.events.push(event);
	state.status = input.status;

	await getDb()
		.update(installs)
		.set({
			status: input.status,
			step: input.step,
			log: input.logLines.join("\n"),
			version: "latest",
			updatedAt: new Date(),
		})
		.where(eq(installs.id, input.installId));

	for (const listener of state.listeners) {
		listener(event);
	}
}

async function ensureInstallStream(serverId: string) {
	const existing = installStreams.get(serverId);
	if (existing) {
		return existing;
	}

	const [installRecord] = await getDb()
		.select({
			id: installs.id,
			status: installs.status,
			step: installs.step,
			log: installs.log,
		})
		.from(installs)
		.where(eq(installs.serverId, serverId))
		.orderBy(desc(installs.createdAt))
		.limit(1);

	const state: InstallStreamState = {
		installId: installRecord?.id ?? randomUUID(),
		serverId,
		events: installRecord ? hydrateInstallEvents(serverId, installRecord) : [],
		listeners: new Set(),
		status: normalizeInstallStatus(installRecord?.status),
		runId: randomUUID(),
	};

	installStreams.set(serverId, state);
	return state;
}

function resetInstallStream(serverId: string, installId: string) {
	const state: InstallStreamState = {
		installId,
		serverId,
		events: [],
		listeners: new Set(),
		status: "pending",
		runId: randomUUID(),
	};

	installStreams.set(serverId, state);
	return state;
}

async function upsertInstallRecord(serverId: string) {
	const db = getDb();
	const [existingInstall] = await db
		.select({ id: installs.id })
		.from(installs)
		.where(eq(installs.serverId, serverId))
		.orderBy(desc(installs.createdAt))
		.limit(1);

	if (!existingInstall) {
		const [createdInstall] = await db
			.insert(installs)
			.values({
				serverId,
				status: "pending",
				step: installSteps[0]?.id ?? "pending",
				log: null,
				version: "latest",
			})
			.returning({ id: installs.id });

		return createdInstall;
	}

	const [updatedInstall] = await db
		.update(installs)
		.set({
			status: "pending",
			step: installSteps[0]?.id ?? "pending",
			log: null,
			version: "latest",
			updatedAt: new Date(),
		})
		.where(eq(installs.id, existingInstall.id))
		.returning({ id: installs.id });

	return updatedInstall;
}

async function getServerForInstall(input: {
	serverId: string;
	userId: string;
}) {
	const [serverRecord] = await getDb()
		.select({
			id: servers.id,
			host: servers.host,
			port: servers.port,
			username: servers.username,
			authMethod: servers.authMethod,
			encryptedCredential: servers.encryptedCredential,
			storeCredential: servers.storeCredential,
		})
		.from(servers)
		.where(
			and(eq(servers.id, input.serverId), eq(servers.userId, input.userId)),
		)
		.limit(1);

	return serverRecord ?? null;
}

function getInstallCredential(input: {
	server: ServerCredentialRecord;
	sessionId?: string | null;
}) {
	if (input.server.storeCredential) {
		if (!input.server.encryptedCredential) {
			throw new Error("Stored credential is missing");
		}

		return decryptSecret(input.server.encryptedCredential);
	}

	if (!input.sessionId) {
		throw new Error("Session is required for ephemeral credentials");
	}

	const ephemeral = getSessionCredential(input.server.id, input.sessionId);
	if (!ephemeral) {
		throw new Error(
			"Temporary credential expired. Reconnect the server first.",
		);
	}

	return ephemeral.credential;
}

function normalizeAuthMethod(authMethod: string): SshAuthMethod | null {
	if (authMethod === "password" || authMethod === "ssh-key") {
		return authMethod;
	}

	return null;
}

function normalizeInstallStatus(status?: string | null): InstallStatus {
	if (
		status === "pending" ||
		status === "running" ||
		status === "succeeded" ||
		status === "failed"
	) {
		return status;
	}

	return "pending";
}

function hydrateInstallEvents(
	serverId: string,
	installRecord: {
		id: string;
		status: string;
		step: string;
		log: string | null;
	},
) {
	if (!installRecord.log) {
		return [];
	}

	const lines = installRecord.log.split("\n").filter(Boolean);
	if (lines.length === 0) {
		return [];
	}

	return lines.map((line, index) => {
		const timestamp = line.slice(0, 24);
		const stepMatch = line.match(/\[(.+?)\]/);
		const messageIndex = line.indexOf("] ");

		return {
			installId: installRecord.id,
			serverId,
			step: stepMatch?.[1] ?? installRecord.step,
			progress: Math.round(((index + 1) / lines.length) * 100),
			message: messageIndex >= 0 ? line.slice(messageIndex + 2) : line,
			status: normalizeInstallStatus(installRecord.status),
			timestamp,
		};
	});
}

function normalizeInstallError(error: unknown) {
	if (error instanceof SshConnectError) {
		return error.message;
	}

	return error instanceof Error ? error.message : "Install failed";
}

function buildComposeWriteCommand() {
	const composeFile = [
		"services:",
		"  hermes:",
		`    image: ${defaultHermesImage}`,
		"    restart: unless-stopped",
	].join("\n");

	return `cat <<'EOF' > ~/hermes/docker-compose.yml\n${composeFile}\nEOF`;
}
