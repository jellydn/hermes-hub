import { eq } from "drizzle-orm";
import type { Context } from "hono";

import {
	type AiProviderId,
	formatAiProviderLabel,
	getAiProviderOption,
	getDefaultAiModel,
	isAiProviderId,
	isValidAiModel,
} from "../src/lib/ai-providers";
import { getAuthSession } from "./auth";
import { buildHermesComposeContent } from "./compose";
import { decryptApiServerKey, decryptSecret, encryptSecret } from "./crypto";
import { clearDashboardCache } from "./dashboard";
import { getDb } from "./db";
import { auditLogs } from "./db/schema";
import { getClientIp } from "./lib/get-client-ip";
import {
	buildProviderEnvMap,
	isApiKeyRequired,
	PROVIDER_ENV_CONFIGS,
	type ProviderConfigSummary,
	type ProviderRequest,
	type StoredProviderRecord,
} from "./providers/config";
import {
	ProviderConnectionError,
	verifyProviderConnection,
} from "./providers/connection";
import {
	decryptApiKey,
	getApiKeyLast4,
	getLatestProviderRecord,
	getTelegramDeployInfo,
} from "./providers/records";
import { getServerById, resolveServerSshConfig } from "./server-records";
import { type SshAuthMethod, shellQuote, withSshConnection } from "./ssh";

export type { ProviderConfigSummary };

export async function getCurrentProviderConfig(userId: string) {
	const record = await getLatestProviderRecord(userId);
	if (!record || !isAiProviderId(record.provider)) {
		return null;
	}

	const parsedApiKey = decryptApiKey(record.encryptedApiKey);

	return {
		provider: record.provider,
		model: record.model,
		keyLast4: getApiKeyLast4(parsedApiKey),
		hasStoredKey: true,
		baseUrl: record.baseUrl ?? undefined,
	} satisfies ProviderConfigSummary;
}

export async function saveProviderConfig(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: ProviderRequest;

	try {
		payload = await context.req.json<ProviderRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const existingRecord = await getLatestProviderRecord(session.user.id);
	const parsed = parseProviderRequest(payload);
	if ("error" in parsed) {
		return context.json({ error: parsed.error }, 400);
	}

	const resolvedApiKey = resolveProviderApiKey(parsed, existingRecord);
	if ("error" in resolvedApiKey) {
		return context.json({ error: resolvedApiKey.error }, 400);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	try {
		await db
			.update(aiProviders)
			.set({ isActive: false })
			.where(eq(aiProviders.userId, session.user.id));

		await db.insert(aiProviders).values({
			userId: session.user.id,
			provider: parsed.provider,
			encryptedApiKey: encryptSecret(resolvedApiKey.apiKey),
			baseUrl: resolvedApiKey.baseUrl || null,
			model: parsed.model,
			label: formatAiProviderLabel(parsed.provider),
			isActive: true,
		});

		await db.insert(auditLogs).values({
			userId: session.user.id,
			action: "provider.saved",
			details: {
				provider: parsed.provider,
				model: parsed.model,
			},
			ipAddress,
		});

		clearDashboardCache();

		return context.json({
			provider: {
				provider: parsed.provider,
				model: parsed.model,
				keyLast4: getApiKeyLast4(resolvedApiKey.apiKey),
				hasStoredKey: true,
				baseUrl: resolvedApiKey.baseUrl || undefined,
			} satisfies ProviderConfigSummary,
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unable to save AI provider settings";

		return context.json({ error: message }, 500);
	}
}

export async function testProviderConfig(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: ProviderRequest;

	try {
		payload = await context.req.json<ProviderRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const existingRecord = await getLatestProviderRecord(session.user.id);
	const parsed = parseProviderRequest(payload);
	if ("error" in parsed) {
		return context.json({ error: parsed.error }, 400);
	}

	const resolvedApiKey = resolveProviderApiKey(parsed, existingRecord);
	if ("error" in resolvedApiKey) {
		return context.json({ error: resolvedApiKey.error }, 400);
	}

	try {
		await verifyProviderConnection({
			provider: parsed.provider,
			apiKey: resolvedApiKey.apiKey,
			baseUrl: resolvedApiKey.baseUrl,
		});

		return context.json({ status: "connected" });
	} catch (error) {
		if (error instanceof ProviderConnectionError) {
			return context.json(
				{ error: error.message },
				error.code === "invalid_api_key" ? 400 : 502,
			);
		}

		return context.json({ error: "Connection failed" }, 502);
	}
}

export async function deployProviderToHermes(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
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

	const telegramInfo = await getTelegramDeployInfo(session.user.id);
	if (!telegramInfo) {
		return context.json(
			{
				error:
					"No Hermes deployment found. Deploy a Telegram bot to a server first.",
			},
			400,
		);
	}

	const serverRecord = await getServerById(telegramInfo.deployedServerId);
	if (!serverRecord) {
		return context.json({ error: "Deployed server not found." }, 404);
	}

	let decryptedBotToken: string;
	try {
		decryptedBotToken = decryptSecret(telegramInfo.botToken);
	} catch {
		return context.json({ error: "Failed to decrypt bot token." }, 500);
	}

	const decryptedApiKey = decryptApiKey(providerRecord.encryptedApiKey);
	if (providerRecord.encryptedApiKey && !decryptedApiKey) {
		return context.json({ error: "Failed to decrypt API key." }, 500);
	}

	const isKeyRequired = !getAiProviderOption(providerRecord.provider)
		?.requiresBaseUrl;
	if (isKeyRequired && !decryptedApiKey) {
		return context.json({ error: "API key is required." }, 500);
	}

	const decryptedApiServerKey = decryptApiServerKey(telegramInfo.apiServerKey);

	const providerEnvVars = buildProviderEnvMap(
		providerRecord.provider,
		decryptedApiKey,
		providerRecord.baseUrl,
	);

	const composeContent = buildHermesComposeContent({
		apiServerKey: decryptedApiServerKey,
		telegramBotToken: decryptedBotToken,
		providerEnvVars,
		hermesModel: providerRecord.model,
	});

	const writeCmd = `cat > ~/hermes/docker-compose.yml << 'DOCKER_EOF'\n${composeContent}\nDOCKER_EOF`;

	let sshConfig: { authMethod: SshAuthMethod; credential: string };
	try {
		sshConfig = resolveServerSshConfig(serverRecord, session.session.id);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Credential unavailable";
		return context.json({ error: message }, 400);
	}

	try {
		await withSshConnection(
			{
				host: serverRecord.host,
				port: serverRecord.port,
				username: serverRecord.username,
				...sshConfig,
			},
			async (ssh) => {
				const writeResult = await ssh.execCommand(writeCmd);
				if (writeResult.code !== 0) {
					throw new Error(
						writeResult.stderr || "Failed to write docker-compose.yml",
					);
				}

				const restartResult = await ssh.execCommand(
					"cd ~/hermes && sudo docker compose up -d --force-recreate",
				);
				if (restartResult.code !== 0) {
					throw new Error(restartResult.stderr || "Failed to restart Hermes");
				}

				await ssh.execCommand("sleep 2");

				const configResult = await ssh.execCommand(
					`docker exec hermes hermes config set model ${shellQuote(providerRecord.model)}`,
				);
				if (configResult.code !== 0) {
					throw new Error(
						configResult.stderr || "Failed to set model inside Hermes",
					);
				}
			},
		);

		await db.insert(auditLogs).values({
			userId: session.user.id,
			action: "provider.deploy.succeeded",
			details: {
				provider: providerRecord.provider,
				model: providerRecord.model,
				serverId: serverRecord.id,
				serverHost: serverRecord.host,
			},
			ipAddress,
		});

		return context.json({
			status: "deployed",
			provider: providerRecord.provider,
			model: providerRecord.model,
			serverHost: serverRecord.host,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Deploy failed";

		await db.insert(auditLogs).values({
			userId: session.user.id,
			action: "provider.deploy.failed",
			details: {
				provider: providerRecord.provider,
				model: providerRecord.model,
				serverId: serverRecord.id,
				error: message,
			},
			ipAddress,
		});

		return context.json({ error: `Deploy failed: ${message}` }, 502);
	}
}

function parseProviderRequest(payload: ProviderRequest) {
	if (!isAiProviderId(payload.provider)) {
		return { error: "Choose a valid provider." };
	}

	const model = payload.model?.trim() || getDefaultAiModel(payload.provider);
	if (!isValidAiModel(payload.provider, model)) {
		return { error: "Choose a valid model for the selected provider." };
	}

	return {
		provider: payload.provider,
		model,
		apiKey: payload.apiKey?.trim() ?? "",
		baseUrl: payload.baseUrl?.trim() ?? "",
	};
}

function resolveProviderApiKey(
	parsed: {
		provider: AiProviderId;
		model: string;
		apiKey: string;
		baseUrl?: string;
	},
	existingRecord: StoredProviderRecord | null,
) {
	let resolvedApiKey = parsed.apiKey;
	let resolvedBaseUrl = parsed.baseUrl;

	if (!resolvedApiKey && existingRecord?.provider === parsed.provider) {
		resolvedApiKey = decryptApiKey(existingRecord.encryptedApiKey);
		if (
			!resolvedApiKey &&
			PROVIDER_ENV_CONFIGS[parsed.provider]?.apiKeyEnvVar
		) {
			return { error: "Stored API key could not be read. Paste a new key." };
		}
		if (!resolvedBaseUrl) {
			resolvedBaseUrl = existingRecord.baseUrl ?? undefined;
		}
	}

	if (!isApiKeyRequired(parsed.provider) && !resolvedBaseUrl) {
		return { error: "Base URL is required." };
	}

	if (isApiKeyRequired(parsed.provider) && !resolvedApiKey) {
		return { error: "API key is required." };
	}

	return { apiKey: resolvedApiKey, baseUrl: resolvedBaseUrl };
}

export async function getProviderDeployConfig(
	userId: string,
): Promise<{ envVars: Record<string, string>; model: string } | null> {
	const record = await getLatestProviderRecord(userId);
	if (!record || !isAiProviderId(record.provider)) {
		return null;
	}

	const config = PROVIDER_ENV_CONFIGS[record.provider];
	let decryptedApiKey = "";

	if (config?.apiKeyEnvVar) {
		const isKeyRequired = isApiKeyRequired(record.provider);

		if (record.encryptedApiKey) {
			decryptedApiKey = decryptApiKey(record.encryptedApiKey);
			if (!decryptedApiKey) {
				throw new Error(
					"Stored API key could not be decrypted. Paste a new key.",
				);
			}
		}

		if (isKeyRequired && !decryptedApiKey) {
			throw new Error(`API key is required for provider ${record.provider}.`);
		}
	}

	return {
		envVars: buildProviderEnvMap(
			record.provider,
			decryptedApiKey,
			record.baseUrl,
		),
		model: record.model,
	};
}
