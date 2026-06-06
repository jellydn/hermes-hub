import type { Context } from "hono";

import { getDb } from "../db";
import { getClientIp } from "../lib/get-client-ip";
import { insertAuditLog } from "../lib/insert-audit-log";
import { requireOwnedServerSsh } from "../request-guards";
import { SshConnectError } from "../ssh";
import { runServerHealthChecks } from "./run";

export async function runServerHealthCheck(context: Context) {
	const ctx = await requireOwnedServerSsh(context);
	if (ctx instanceof Response) {
		return ctx;
	}

	const ipAddress = getClientIp(context);
	const db = getDb();

	await insertAuditLog(db, {
		userId: ctx.session.user.id,
		action: "server.health_check.started",
		serverId: ctx.serverId,
		details: {
			serverId: ctx.serverId,
			host: ctx.server.host,
		},
		ipAddress,
	});

	try {
		const healthCheck = await runServerHealthChecks({
			server: ctx.server,
			authMethod: ctx.authMethod,
			credential: ctx.credential,
		});

		await insertAuditLog(db, {
			userId: ctx.session.user.id,
			action: "server.health_check.succeeded",
			serverId: ctx.serverId,
			details: {
				serverId: ctx.serverId,
				host: ctx.server.host,
				status: healthCheck.status,
				checkedAt: healthCheck.checkedAt,
			},
			ipAddress,
		});

		return context.json({ healthCheck });
	} catch (error) {
		const message = normalizeHealthCheckError(error);

		await insertAuditLog(db, {
			userId: ctx.session.user.id,
			action: "server.health_check.failed",
			serverId: ctx.serverId,
			details: {
				serverId: ctx.serverId,
				host: ctx.server.host,
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
