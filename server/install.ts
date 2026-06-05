import { desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { getAuthSession } from "./auth";
import { getDb } from "./db";
import { installEvents, installs } from "./db/schema";
import { buildLogLinesFromEvents } from "./install/legacy-log";
import { getServerForInstall, upsertInstallRecord } from "./install/records";
import {
	ensureInstallStream,
	HEARTBEAT_INTERVAL_MS,
	IDLE_TIMEOUT_MS,
	type InstallEvent,
	installStreams,
	releaseInstallStream,
	tryClaimInstallStream,
} from "./install/sse-stream";
import { installSteps, runInstallWorkflow } from "./install/workflow";
import { getClientIp } from "./lib/get-client-ip";
import { insertAuditLog } from "./lib/insert-audit-log";
import {
	getOwnedServerRecord,
	resolveServerSshConfigOrError,
} from "./server-records";

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

	const sshResult = resolveServerSshConfigOrError(
		serverRecord,
		session.session.id,
	);
	if (!sshResult.ok) {
		return context.json({ error: sshResult.error }, 400);
	}
	const { authMethod, credential } = sshResult;

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

	await insertAuditLog(db, {
		userId: session.user.id,
		action: "server.install.started",
		serverId,
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
			updatedAt: installs.updatedAt,
			createdAt: installs.createdAt,
			legacyLog: installs.log,
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

	const events = await getDb()
		.select({
			step: installEvents.step,
			message: installEvents.message,
			createdAt: installEvents.createdAt,
		})
		.from(installEvents)
		.where(eq(installEvents.installId, installRecord.id))
		.orderBy(installEvents.createdAt);

	const logLines = buildLogLinesFromEvents(
		events,
		installRecord.legacyLog,
		installRecord.createdAt,
	);

	return context.json({
		installId: installRecord.id,
		status: installRecord.status,
		step: installRecord.step,
		log: logLines.join("\n") || null,
		updatedAt: installRecord.updatedAt,
	});
}
