import type { Context } from "hono";
import type { NodeSSH } from "node-ssh";

import { clearDashboardCache } from "../dashboard";
import { getDb } from "../db";
import { getClientIp } from "../lib/get-client-ip";
import { insertAuditLog } from "../lib/insert-audit-log";
import type { AuthSession, OwnedServerSshContext } from "../request-guards";
import { withSshConnection } from "../ssh";
import { resolveHermesDeployContext } from "./deploy-context";
import { PartialDeployError } from "./partial-deploy-error";
import { restartGateway } from "./runtime";

type DeployAuditDetails = Record<string, unknown>;

type DeployToHermesAgentOptions = {
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

export async function deployToHermesAgent(
	context: Context,
	session: AuthSession,
	serverId: string | undefined,
	options: DeployToHermesAgentOptions,
): Promise<Response> {
	const deployCtx = await resolveHermesDeployContext(
		context,
		session,
		serverId,
	);
	if (deployCtx instanceof Response) {
		return deployCtx;
	}

	const { sshCtx } = deployCtx;
	const db = getDb();
	const ipAddress = getClientIp(context);
	const deployedAt = new Date();

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
		if (error instanceof PartialDeployError) {
			// Core deploy succeeded but some optional items were blocked.
			// Write success audit + forward blocked skill names in the response.
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
				serverId: sshCtx.serverId,
				...options.buildSuccessResponse(sshCtx, deployedAt),
				blockedSkills: error.blockedSkills,
			});
		}

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
		serverId: sshCtx.serverId,
		...options.buildSuccessResponse(sshCtx, deployedAt),
	});
}
