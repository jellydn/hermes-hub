import type { Context } from "hono";
import {
	getProviderCredentialPolicy,
	isAiProviderId,
} from "../src/lib/ai-providers";
import { decryptApiServerKey, decryptSecret } from "./crypto";
import { getDb } from "./db";
import { resolveTelegramHermesDeployContext } from "./hermes/telegram-deploy-context";
import { getClientIp } from "./lib/get-client-ip";
import { insertAuditLog } from "./lib/insert-audit-log";
import { deployManagedCompose } from "./managed-compose-deploy";
import { resolveRemoteCodexAuthStatus } from "./providers/codex-auth";
import { PROVIDER_ENV_CONFIGS } from "./providers/config";
import { decryptApiKey, getLatestProviderRecord } from "./providers/records";
import { requireAuthSession } from "./request-guards";

export async function deployProviderToHermes(context: Context) {
	const session = await requireAuthSession(context);
	if (session instanceof Response) {
		return session;
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	const providerRecord = await getLatestProviderRecord(session.user.id);
	if (!providerRecord || !isAiProviderId(providerRecord.provider)) {
		return context.json(
			{ error: "No provider config found. Save a provider first." },
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

	const decryptedApiKey = decryptApiKey(providerRecord.encryptedApiKey);
	if (providerRecord.encryptedApiKey && !decryptedApiKey) {
		return context.json({ error: "Failed to decrypt API key." }, 500);
	}

	const credentialPolicy = getProviderCredentialPolicy(providerRecord.provider);
	if (credentialPolicy.requiresApiKey && !decryptedApiKey) {
		return context.json({ error: "API key is required." }, 400);
	}

	if (credentialPolicy.requiresRemoteOAuth) {
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
			const message =
				error instanceof Error
					? error.message
					: "Unable to verify Codex authentication.";
			return context.json({ error: message }, 502);
		}
	}

	const providerHermesId =
		PROVIDER_ENV_CONFIGS[providerRecord.provider]?.hermesProvider;
	if (!providerHermesId) {
		return context.json({ error: "Unsupported provider deploy target." }, 400);
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
			providerModel: providerRecord.model,
			providerHermesId,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Deploy failed";

		try {
			await insertAuditLog(db, {
				userId: session.user.id,
				action: "provider.deploy.failed",
				serverId: sshCtx.serverId,
				details: {
					provider: providerRecord.provider,
					model: providerRecord.model,
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
				provider: providerRecord.provider,
				model: providerRecord.model,
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
		provider: providerRecord.provider,
		model: providerRecord.model,
		serverHost: sshCtx.server.host,
	});
}
