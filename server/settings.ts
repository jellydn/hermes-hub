import type { Context } from "hono";

import { getAuthSession } from "./auth";
import { clearDashboardCache } from "./dashboard";
import { getDb } from "./db";
import { writeSoulMd } from "./hermes/persona";
import { restartGateway } from "./hermes/runtime";
import { resolveTelegramHermesDeployContext } from "./hermes/telegram-deploy-context";
import { getClientIp } from "./lib/get-client-ip";
import { insertAuditLog } from "./lib/insert-audit-log";
import { requireAuthSession } from "./request-guards";
import { parsePersonaSaveBody } from "./settings/config";
import {
	getCurrentPersonaSettings,
	getHermesSettingsRecord,
	upsertHermesSettingsRecord,
} from "./settings/records";
import { withSshConnection } from "./ssh";

export type { PersonaSettingsSummary } from "./settings/config";
export { getCurrentPersonaSettings };

export async function savePersonaSettings(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: unknown;
	try {
		payload = await context.req.json();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const parsed = parsePersonaSaveBody(payload);
	if (!parsed.ok) {
		return context.json({ error: parsed.error }, 400);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	try {
		const settings = await db.transaction(async (tx) => {
			const saved = await upsertHermesSettingsRecord(tx, {
				userId: session.user.id,
				agentPersona: parsed.content,
			});

			await insertAuditLog(tx, {
				userId: session.user.id,
				action: "persona.saved",
				details: {
					characterCount: parsed.content.length,
				},
				ipAddress,
			});

			return saved;
		});

		clearDashboardCache();

		return context.json({ settings });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unable to save persona settings";

		return context.json({ error: message }, 500);
	}
}

export async function deployPersonaToHermes(context: Context) {
	const session = await requireAuthSession(context);
	if (session instanceof Response) {
		return session;
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	const settingsRecord = await getHermesSettingsRecord(session.user.id);
	if (!settingsRecord?.agentPersona) {
		return context.json(
			{ error: "No persona saved. Save a persona first." },
			400,
		);
	}

	const deployCtx = await resolveTelegramHermesDeployContext(context, session);
	if (deployCtx instanceof Response) {
		return deployCtx;
	}

	const { sshCtx } = deployCtx;

	try {
		await withSshConnection(
			{
				host: sshCtx.server.host,
				port: sshCtx.server.port,
				username: sshCtx.server.username,
				authMethod: sshCtx.authMethod,
				credential: sshCtx.credential,
				expectedFingerprint: sshCtx.server.hostKeyFingerprint ?? undefined,
			},
			async (ssh) => {
				await writeSoulMd(ssh, settingsRecord.agentPersona);
				await restartGateway(ssh);
			},
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Deploy failed";

		try {
			await insertAuditLog(db, {
				userId: session.user.id,
				action: "persona.deploy.failed",
				serverId: sshCtx.serverId,
				details: {
					serverId: sshCtx.serverId,
					serverHost: sshCtx.server.host,
					error: message,
				},
				ipAddress,
			});
		} catch {
			// Audit logging is historical only; still return deploy failure to client.
		}

		return context.json({ error: `Deploy failed: ${message}` }, 502);
	}

	const deployedAt = new Date();

	try {
		await insertAuditLog(db, {
			userId: session.user.id,
			action: "persona.deployed",
			serverId: sshCtx.serverId,
			details: {
				serverId: sshCtx.serverId,
				serverHost: sshCtx.server.host,
			},
			ipAddress,
		});
	} catch {
		// Deploy already succeeded remotely; audit logging is historical only.
	}

	clearDashboardCache();

	return context.json({
		status: "deployed",
		serverHost: sshCtx.server.host,
		deployedAt: deployedAt.toISOString(),
	});
}
