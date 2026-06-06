import type { Context } from "hono";

import { getAuthSession } from "./auth";
import { getDb } from "./db";
import { runServerHealthChecks } from "./health-check/run";
import { getClientIp } from "./lib/get-client-ip";
import { insertAuditLog } from "./lib/insert-audit-log";
import {
	getOwnedServerRecord,
	resolveServerSshConfigOrError,
} from "./server-records";
import { SshConnectError } from "./ssh";

export async function runServerHealthCheck(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	const db = getDb();
	const serverRecord = await getOwnedServerRecord({
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

	const ipAddress = getClientIp(context);

	await insertAuditLog(db, {
		userId: session.user.id,
		action: "server.health_check.started",
		serverId,
		details: {
			serverId,
			host: serverRecord.host,
		},
		ipAddress,
	});

	try {
		const healthCheck = await runServerHealthChecks({
			server: serverRecord,
			authMethod: sshResult.authMethod,
			credential: sshResult.credential,
		});

		await insertAuditLog(db, {
			userId: session.user.id,
			action: "server.health_check.succeeded",
			serverId,
			details: {
				serverId,
				host: serverRecord.host,
				status: healthCheck.status,
				checkedAt: healthCheck.checkedAt,
			},
			ipAddress,
		});

		return context.json({ healthCheck });
	} catch (error) {
		const message = normalizeHealthCheckError(error);

		await insertAuditLog(db, {
			userId: session.user.id,
			action: "server.health_check.failed",
			serverId,
			details: {
				serverId,
				host: serverRecord.host,
				message,
			},
			ipAddress,
		});

		return context.json({ error: `Health check failed: ${message}` }, 400);
	}
}

function normalizeHealthCheckError(error: unknown) {
	if (error instanceof SshConnectError) {
		return error.message;
	}

	return error instanceof Error ? error.message : "Remote health check failed";
}
