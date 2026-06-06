import type { Context } from "hono";

import { getAuthSession } from "./auth";
import { clearDashboardCache } from "./dashboard";
import { getDb } from "./db";
import { deployToHermesAgent } from "./hermes/deploy";
import { writeSoulMd } from "./hermes/persona";
import { getClientIp } from "./lib/get-client-ip";
import { insertAuditLog } from "./lib/insert-audit-log";
import { requireAuthSession } from "./request-guards";
import { parsePersonaSaveBody } from "./settings/config";
import { parseDeployServerIdBody } from "./settings/deploy-body";
import {
	getCurrentPersonaSettings,
	getHermesSettingsRecord,
	upsertHermesSettingsRecord,
} from "./settings/records";

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

	const settingsRecord = await getHermesSettingsRecord(session.user.id);
	if (!settingsRecord?.agentPersona) {
		return context.json(
			{ error: "No persona saved. Save a persona first." },
			400,
		);
	}

	let payload: unknown;
	try {
		payload = await context.req.json();
	} catch {
		payload = null;
	}

	const parsed = parseDeployServerIdBody(payload);
	if (!parsed.ok) {
		return context.json({ error: parsed.error }, 400);
	}

	return deployToHermesAgent(context, session, parsed.serverId, {
		deploy: async (ssh) => {
			await writeSoulMd(ssh, settingsRecord.agentPersona);
		},
		failureAuditAction: "persona.deploy.failed",
		successAuditAction: "persona.deployed",
		buildFailureAuditDetails: (sshCtx, error) => ({
			serverId: sshCtx.serverId,
			serverHost: sshCtx.server.host,
			error,
		}),
		buildSuccessAuditDetails: (sshCtx) => ({
			serverId: sshCtx.serverId,
			serverHost: sshCtx.server.host,
		}),
		buildSuccessResponse: (sshCtx, deployedAt) => ({
			serverHost: sshCtx.server.host,
			deployedAt: deployedAt.toISOString(),
		}),
	});
}
