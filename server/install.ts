import { and, desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { getAuthSession } from "./auth";
import { getSessionCredential } from "./credentials";
import { decryptSecret } from "./crypto";
import { getDb } from "./db";
import { auditLogs, installs, servers } from "./db/schema";
import { buildGhcrLoginCommand } from "./ghcr";
import {
	emitInstallEvent,
	ensureInstallStream,
	HEARTBEAT_INTERVAL_MS,
	IDLE_TIMEOUT_MS,
	type InstallEvent,
	installStreams,
	releaseInstallStream,
	tryClaimInstallStream,
} from "./install/sse-stream";
import { getClientIp } from "./lib/get-client-ip";
import { getOwnedServerRecord } from "./server-records";
import { type SshAuthMethod, SshConnectError, withSshConnection } from "./ssh";

type InstallStep = {
	id: string;
	progress: number;
	message: string;
	command: string;
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

const defaultHermesImage = "nousresearch/hermes-agent:latest";

function buildInstallSteps(): InstallStep[] {
	const steps: InstallStep[] = [
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
	];

	const ghcrLogin = buildGhcrLoginCommand();
	if (ghcrLogin) {
		steps.push({
			id: "login-ghcr",
			progress: 70,
			message: "Authenticating with GitHub Container Registry",
			command: ghcrLogin,
		});
	}

	steps.push(
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
	);

	return steps;
}

const installSteps = buildInstallSteps();

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

	// Claim the in-process install slot synchronously before any await so
	// two near-simultaneous requests cannot both start an install workflow
	// against the same server.
	const claimed = tryClaimInstallStream(serverId);
	if (!claimed) {
		return context.json({ error: "Install already in progress" }, 409);
	}

	let installRecord: { id: string };
	try {
		installRecord = await upsertInstallRecord(serverId);
	} catch (error) {
		releaseInstallStream(serverId, claimed.runId);
		throw error;
	}

	// Replace the placeholder with the real installId; preserve the runId so
	// the claim remains valid and emitInstallEvent stays gated.
	const state = installStreams.get(serverId);
	if (state && state.runId === claimed.runId) {
		state.installId = installRecord.id;
	} else {
		// Slot was clobbered (should be impossible in single-process flow).
		releaseInstallStream(serverId, claimed.runId);
		return context.json({ error: "Install already in progress" }, 409);
	}

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
		runId: claimed.runId,
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
		// and no heartbeat write has succeeded. The heartbeat doubles as a
		// liveness probe — successful writes prove the connection is still
		// usable, so they reset the idle timer; install steps such as
		// `apt-get install` or `docker compose pull` regularly exceed 90s
		// of silence between progress events.
		let idleTimer: ReturnType<typeof setTimeout> | null = null;
		let heartbeat: ReturnType<typeof setInterval> | null = null;

		await new Promise<void>((resolve) => {
			let settled = false;
			let listener: ((event: InstallEvent) => Promise<void>) | null = null;

			function cleanup() {
				if (settled) {
					return;
				}
				settled = true;
				if (heartbeat) {
					clearInterval(heartbeat);
					heartbeat = null;
				}
				if (idleTimer) {
					clearTimeout(idleTimer);
					idleTimer = null;
				}
				if (listener) {
					state.listeners.delete(listener);
				}
				resolve();
			}

			function resetIdleTimer() {
				if (settled) {
					return;
				}
				if (idleTimer) {
					clearTimeout(idleTimer);
				}
				idleTimer = setTimeout(() => {
					stream.close();
					cleanup();
				}, IDLE_TIMEOUT_MS);
			}

			heartbeat = setInterval(async () => {
				try {
					await stream.writeSSE({ data: ": heartbeat" });
					resetIdleTimer();
				} catch {
					// Stream is gone; tear everything down.
					cleanup();
				}
			}, HEARTBEAT_INTERVAL_MS);

			listener = async (event: InstallEvent) => {
				resetIdleTimer();

				await stream.writeSSE({
					event: "install-progress",
					data: JSON.stringify(event),
				});

				if (event.status === "succeeded" || event.status === "failed") {
					cleanup();
				}
			};

			resetIdleTimer();
			state.listeners.add(listener);
			stream.onAbort(cleanup);
		});
	});
}

export async function getLatestServerInstallLog(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	const serverRecord = await getOwnedServerRecord({
		serverId,
		userId: session.user.id,
	});
	if (!serverRecord) {
		return context.json({ error: "Server not found" }, 404);
	}

	const [installRecord] = await getDb()
		.select({
			id: installs.id,
			status: installs.status,
			step: installs.step,
			log: installs.log,
			updatedAt: installs.updatedAt,
		})
		.from(installs)
		.where(eq(installs.serverId, serverId))
		.orderBy(desc(installs.createdAt))
		.limit(1);

	if (!installRecord) {
		return context.json({
			installId: null,
			status: null,
			step: null,
			log: null,
			updatedAt: null,
		});
	}

	return context.json({
		installId: installRecord.id,
		status: installRecord.status,
		step: installRecord.step,
		log: installRecord.log,
		updatedAt: installRecord.updatedAt,
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
