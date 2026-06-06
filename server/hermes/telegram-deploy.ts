import type { Context } from "hono";
import type { NodeSSH } from "node-ssh";

import { clearDashboardCache } from "../dashboard";
import { getDb } from "../db";
import { getClientIp } from "../lib/get-client-ip";
import { insertAuditLog } from "../lib/insert-audit-log";
import type { AuthSession, OwnedServerSshContext } from "../request-guards";
import { withSshConnection } from "../ssh";
import { restartGateway } from "./runtime";
import { resolveTelegramHermesDeployContext } from "./telegram-deploy-context";

type DeployAuditDetails = Record<string, unknown>;

type DeployToTelegramLinkedHermesOptions = {
	deploy: (ssh: NodeSSH) => Promise<void>;
	failureAuditAction: string;
	successAuditAction: string;
	buildFailureAuditDetails: (
		sshCtx: OwnedServerSshContext,
		error: string,
	) => DeployAuditDetails;
	buildSuccessAuditDetails: (
		sshCtx: OwnedServerSshContext,
	) => DeployAuditDetails;
	buildSuccessResponse: (
		sshCtx: OwnedServerSshContext,
		deployedAt: Date,
	) => Record<string, unknown>;
};

export async function deployToTelegramLinkedHermes(
	context: Context,
	session: AuthSession,
	options: DeployToTelegramLinkedHermesOptions,
): Promise<Response> {
	const deployCtx = await resolveTelegramHermesDeployContext(context, session);
	if (deployCtx instanceof Response) {
		return deployCtx;
	}

	const { sshCtx } = deployCtx;
	const db = getDb();
	const ipAddress = getClientIp(context);

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
				await options.deploy(ssh);
				await restartGateway(ssh);
			},
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Deploy failed";

		try {
			await insertAuditLog(db, {
				userId: session.user.id,
				action: options.failureAuditAction,
				serverId: sshCtx.serverId,
				details: options.buildFailureAuditDetails(sshCtx, message),
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
			action: options.successAuditAction,
			serverId: sshCtx.serverId,
			details: options.buildSuccessAuditDetails(sshCtx),
			ipAddress,
		});
	} catch {
		// Deploy already succeeded remotely; audit logging is historical only.
	}

	clearDashboardCache();

	return context.json({
		status: "deployed",
		...options.buildSuccessResponse(sshCtx, deployedAt),
	});
}
