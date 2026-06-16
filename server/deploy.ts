import type { Context } from "hono";
import { decryptApiServerKey, decryptSecret } from "./crypto";
import { getDb } from "./db";
import { resolveTelegramHermesDeployContext } from "./hermes/telegram-deploy-context";
import { getClientIp } from "./lib/get-client-ip";
import { insertAuditLog } from "./lib/insert-audit-log";
import { deployManagedCompose } from "./managed-compose-deploy";
import { resolveActiveModelBackend } from "./providers/active-backend";
import { resolveRemoteCodexAuthStatus } from "./providers/codex-auth";
import {
	assertApiBackendDeployable,
	resolveSubscriptionDeployTarget,
} from "./providers/deploy-material";
import { requireAuthSession } from "./request-guards";
import { SshConnectError } from "./ssh";

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
				if (
					error instanceof SshConnectError &&
					(error.code === "host_key_missing" ||
						error.code === "host_key_mismatch")
				) {
					const hostKeyBase = {
						observedFingerprint: error.hostKey?.fingerprint ?? "",
						observedAlgorithm: error.hostKey?.algorithm ?? "",
					};

					const payload: Record<string, unknown> = {
						code: error.code,
						error:
							error.code === "host_key_missing"
								? "Host key fingerprint not stored for this server. Trust the host key and retry."
								: "Host key fingerprint mismatch.",
						serverId: sshCtx.serverId,
						serverHost: sshCtx.server.host,
						hostKey: hostKeyBase,
					};

					if (error.code === "host_key_mismatch") {
						(payload.hostKey as Record<string, string>).expectedFingerprint =
							sshCtx.server.hostKeyFingerprint ?? "";
					}

					return context.json(payload, 409);
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
		if (
			error instanceof SshConnectError &&
			(error.code === "host_key_missing" || error.code === "host_key_mismatch")
		) {
			const hostKeyBase = {
				observedFingerprint: error.hostKey?.fingerprint ?? "",
				observedAlgorithm: error.hostKey?.algorithm ?? "",
			};

			const payload: Record<string, unknown> = {
				code: error.code,
				error:
					error.code === "host_key_missing"
						? "Host key fingerprint not stored for this server. Trust the host key and retry."
						: "Host key fingerprint mismatch.",
				serverId: sshCtx.serverId,
				serverHost: sshCtx.server.host,
				hostKey: hostKeyBase,
			};

			if (error.code === "host_key_mismatch") {
				(payload.hostKey as Record<string, string>).expectedFingerprint =
					sshCtx.server.hostKeyFingerprint ?? "";
			}

			return context.json(payload, 409);
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
		} catch {
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
	} catch {
		// Deploy already succeeded remotely; audit logging is historical only.
	}

	return context.json({
		status: "deployed",
		provider: deployProviderLabel,
		model: deployModel,
		serverHost: sshCtx.server.host,
	});
}
