import type { Context } from "hono";

import { getAuthSession } from "./auth";
import { clearDashboardCache } from "./dashboard";
import { getDb } from "./db";
import { validateAgentPersona, writeSoulMd } from "./hermes/persona";
import { restartGateway } from "./hermes/runtime";
import { getClientIp } from "./lib/get-client-ip";
import { insertAuditLog } from "./lib/insert-audit-log";
import { getTelegramDeployInfo } from "./providers/records";
import {
	requireAuthSession,
	requireOwnedServerSshById,
} from "./request-guards";
import {
	getCurrentPersonaSettings,
	getHermesSettingsRecord,
	upsertHermesSettingsRecord,
} from "./settings/records";
import { withSshConnection } from "./ssh";

export type { PersonaSettingsSummary } from "./settings/records";
export { getCurrentPersonaSettings };

type PersonaSaveRequest = {
	agentPersona?: unknown;
};

export async function savePersonaSettings(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: PersonaSaveRequest;
	try {
		payload = await context.req.json<PersonaSaveRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	if (!payload || typeof payload.agentPersona !== "string") {
		return context.json({ error: "Persona content is required." }, 400);
	}

	const validated = validateAgentPersona(payload.agentPersona);
	if (!validated.ok) {
		return context.json({ error: validated.error }, 400);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	try {
		await db.transaction(async (tx) => {
			await upsertHermesSettingsRecord(tx, {
				userId: session.user.id,
				agentPersona: validated.content,
			});

			await insertAuditLog(tx, {
				userId: session.user.id,
				action: "persona.saved",
				details: {
					characterCount: validated.content.length,
				},
				ipAddress,
			});
		});

		clearDashboardCache();

		const settings = await getCurrentPersonaSettings(session.user.id);
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

	const telegramInfo = await getTelegramDeployInfo(session.user.id);
	if (!telegramInfo?.deployedServerId) {
		return context.json(
			{
				error:
					"No Hermes deployment found. Deploy a Telegram bot to a server first.",
			},
			400,
		);
	}

	const sshCtx = await requireOwnedServerSshById(
		context,
		telegramInfo.deployedServerId,
		session,
	);
	if (sshCtx instanceof Response) {
		return sshCtx;
	}

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
		await db.transaction(async (tx) => {
			await upsertHermesSettingsRecord(tx, {
				userId: session.user.id,
				agentPersona: settingsRecord.agentPersona,
				deployedServerId: sshCtx.serverId,
				deployedServerHost: sshCtx.server.host,
				deployedAt,
			});

			await insertAuditLog(tx, {
				userId: session.user.id,
				action: "persona.deployed",
				serverId: sshCtx.serverId,
				details: {
					serverId: sshCtx.serverId,
					serverHost: sshCtx.server.host,
				},
				ipAddress,
			});
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unable to record persona deploy metadata";

		return context.json({ error: message }, 500);
	}

	clearDashboardCache();

	return context.json({
		status: "deployed",
		serverHost: sshCtx.server.host,
		deployedAt: deployedAt.toISOString(),
	});
}
