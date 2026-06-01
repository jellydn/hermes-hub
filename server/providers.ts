import { eq } from "drizzle-orm";
import type { Context } from "hono";

import {
	type AiProviderId,
	formatAiProviderLabel,
	getDefaultAiModel,
	isAiProviderId,
	isValidAiModel,
} from "../src/lib/ai-providers";
import { getAuthSession } from "./auth";
import { encryptSecret } from "./crypto";
import { clearDashboardCache } from "./dashboard";
import { getDb } from "./db";
import { aiProviders, auditLogs } from "./db/schema";
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
} from "./providers/records";

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
