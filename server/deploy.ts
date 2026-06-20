import type { Context } from "hono";
import { decryptApiServerKey, decryptSecret } from "./crypto";
import { getDb } from "./db";
import { resolveTelegramHermesDeployContext } from "./hermes/telegram-deploy-context";
import { getClientIp } from "./lib/get-client-ip";
import {
	hostKeyErrorResponse,
	isRecoverableHostKeyError,
} from "./lib/host-key-error-response";
import { insertAuditLog } from "./lib/insert-audit-log";
import { logger } from "./lib/logger";
import { deployManagedCompose } from "./managed-compose-deploy";
import { resolveRemoteCodexAuthStatus } from "./providers/codex-auth";
import {
	assertApiBackendDeployable,
	resolveSubscriptionDeployTarget,
} from "./providers/deploy-material";
import { resolveActiveModelBackend } from "./providers/model-access";
import { requireAuthSession } from "./request-guards";

export async function deployProviderToHermes(context: Context) {
	const session = await requireAuthSession(context);
	if (session instanceof Response) {
		return session;
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	const activeBackend = await resolveActiveModelBackend(session.user.id);
	if (!activeBackend) {
		return context.json(
			{
				error:
					"No model access config found. Save an API provider or subscription first.",
			},
			400,
		);
	}

	const deployCtx = await resolveTelegramHermesDeployContext(context, session);
	if (deployCtx instanceof Response) {
		return deployCtx;
	}

	const { telegramInfo, sshCtx } = deployCtx;

	try {
		decryptSecret(telegramInfo.botToken);
	} catch {
		return context.json({ error: "Failed to decrypt bot token." }, 500);
	}

	let providerHermesId: string;
	let deployModel: string;
	let deployProviderLabel: string;

	if (activeBackend.kind === "subscription") {
		if (activeBackend.access === "oauth") {
			try {
				const codexAuth = await resolveRemoteCodexAuthStatus({
					host: sshCtx.server.host,
					port: sshCtx.server.port,
					username: sshCtx.server.username,
					authMethod: sshCtx.authMethod,
					credential: sshCtx.credential,
					expectedFingerprint: sshCtx.server.hostKeyFingerprint ?? undefined,
				});

				if (!codexAuth.authenticated) {
					return context.json(
						{
							error:
								"Codex is not authenticated on the deployed Hermes server. Complete ChatGPT device-code login first.",
						},
						400,
					);
				}
			} catch (error) {
				if (isRecoverableHostKeyError(error)) {
					return hostKeyErrorResponse(context, error, {
						serverId: sshCtx.serverId,
						serverHost: sshCtx.server.host,
						expectedFingerprint: sshCtx.server.hostKeyFingerprint,
					});
				}

				const message =
					error instanceof Error
						? error.message
						: "Unable to verify Codex authentication.";
				return context.json({ error: message }, 502);
			}
		}

		const deployTarget = resolveSubscriptionDeployTarget(activeBackend);
		providerHermesId = deployTarget.hermesProviderId;
		deployModel = deployTarget.model;
		deployProviderLabel = deployTarget.deployLabel;
	} else {
		const deployable = assertApiBackendDeployable(activeBackend);
		if (!deployable.ok) {
			return context.json({ error: deployable.error }, 400);
		}

		providerHermesId = deployable.hermesProviderId;
		deployModel = deployable.model;
		deployProviderLabel = deployable.deployLabel;
	}

	const decryptedApiServerKey = decryptApiServerKey(telegramInfo.apiServerKey);

	try {
		await deployManagedCompose({
			intent: "provider",
			userId: session.user.id,
			serverId: sshCtx.serverId,
			host: sshCtx.server.host,
			port: sshCtx.server.port,
			username: sshCtx.server.username,
			authMethod: sshCtx.authMethod,
			credential: sshCtx.credential,
			expectedFingerprint: sshCtx.server.hostKeyFingerprint ?? undefined,
			apiServerKey: decryptedApiServerKey,
			providerModel: deployModel,
			providerHermesId,
		});
	} catch (error) {
		if (isRecoverableHostKeyError(error)) {
			return hostKeyErrorResponse(context, error, {
				serverId: sshCtx.serverId,
				serverHost: sshCtx.server.host,
				expectedFingerprint: sshCtx.server.hostKeyFingerprint,
			});
		}

		const message = error instanceof Error ? error.message : "Deploy failed";

		try {
			await insertAuditLog(db, {
				userId: session.user.id,
				action: "provider.deploy.failed",
				serverId: sshCtx.serverId,
				details: {
					provider: deployProviderLabel,
					model: deployModel,
					serverId: sshCtx.serverId,
					error: message,
				},
				ipAddress,
			});
		} catch (auditError) {
			logger.error(
				auditError instanceof Error
					? auditError
					: new Error(String(auditError)),
				"Failed to record deploy failure audit log",
			);
			// Audit logging is historical only; still return deploy failure to client.
		}

		return context.json({ error: `Deploy failed: ${message}` }, 502);
	}

	try {
		await insertAuditLog(db, {
			userId: session.user.id,
			action: "provider.deploy.succeeded",
			serverId: sshCtx.serverId,
			details: {
				provider: deployProviderLabel,
				model: deployModel,
				serverId: sshCtx.serverId,
				serverHost: sshCtx.server.host,
			},
			ipAddress,
		});
	} catch (auditError) {
		logger.error(
			auditError instanceof Error ? auditError : new Error(String(auditError)),
			"Failed to record deploy success audit log",
		);
		// Deploy already succeeded remotely; audit logging is historical only.
	}

	return context.json({
		status: "deployed",
		provider: deployProviderLabel,
		model: deployModel,
		serverHost: sshCtx.server.host,
	});
}
