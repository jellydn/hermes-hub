import { desc, eq } from "drizzle-orm";
import type { Context } from "hono";

import {
	type AiProviderId,
	formatAiProviderLabel,
	getDefaultAiModel,
	isAiProviderId,
	isValidAiModel,
} from "../src/lib/ai-providers";
import { getAuthSession } from "./auth";
import { decryptSecret, encryptSecret } from "./crypto";
import { getDb } from "./db";
import { aiProviders, auditLogs } from "./db/schema";
import { getClientIp } from "./lib/get-client-ip";

type ProviderRequest = {
	provider: string;
	model?: string;
	apiKey?: string;
};

type StoredProviderRecord = {
	provider: string;
	model: string;
	encryptedApiKey: string;
};

export type ProviderConfigSummary = {
	provider: AiProviderId;
	model: string;
	keyLast4: string | null;
	hasStoredKey: boolean;
};

class ProviderConnectionError extends Error {
	constructor(
		message: string,
		readonly code: "invalid_api_key" | "connection_failed",
	) {
		super(message);
		this.name = "ProviderConnectionError";
	}
}

export async function getCurrentProviderConfig(userId: string) {
	const record = await getLatestProviderRecord(userId);
	if (!record || !isAiProviderId(record.provider)) {
		return null;
	}

	return {
		provider: record.provider,
		model: record.model,
		keyLast4: getKeyLast4(record.encryptedApiKey),
		hasStoredKey: true,
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

		return context.json({
			provider: {
				provider: parsed.provider,
				model: parsed.model,
				keyLast4: getApiKeyLast4(resolvedApiKey.apiKey),
				hasStoredKey: true,
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
		return { error: "Choose OpenAI, Anthropic, or OpenRouter." };
	}

	const model = (
		payload.model?.trim() || getDefaultAiModel(payload.provider)
	).trim();
	if (!isValidAiModel(payload.provider, model)) {
		return { error: "Choose a valid model for the selected provider." };
	}

	return {
		provider: payload.provider,
		model,
		apiKey: payload.apiKey?.trim() ?? "",
	};
}

function resolveProviderApiKey(
	parsed: { provider: AiProviderId; model: string; apiKey: string },
	existingRecord: StoredProviderRecord | null,
) {
	if (parsed.apiKey) {
		return { apiKey: parsed.apiKey };
	}

	if (!existingRecord || existingRecord.provider !== parsed.provider) {
		return { error: "API key is required." };
	}

	try {
		return { apiKey: decryptSecret(existingRecord.encryptedApiKey) };
	} catch {
		return { error: "Stored API key could not be read. Paste a new key." };
	}
}

async function getLatestProviderRecord(userId: string) {
	const [record] = await getDb()
		.select({
			provider: aiProviders.provider,
			model: aiProviders.model,
			encryptedApiKey: aiProviders.encryptedApiKey,
		})
		.from(aiProviders)
		.where(eq(aiProviders.userId, userId))
		.orderBy(desc(aiProviders.createdAt))
		.limit(1);

	return record ?? null;
}

async function verifyProviderConnection(input: {
	provider: AiProviderId;
	apiKey: string;
}) {
	const request = createProviderTestRequest(input);

	let response: Response;

	try {
		response = await fetch(request.url, request.init);
	} catch {
		throw new ProviderConnectionError("Connection failed", "connection_failed");
	}

	if (response.ok) {
		return;
	}

	if (response.status === 401 || response.status === 403) {
		throw new ProviderConnectionError("Invalid API key", "invalid_api_key");
	}

	throw new ProviderConnectionError("Connection failed", "connection_failed");
}

function createProviderTestRequest(input: {
	provider: AiProviderId;
	apiKey: string;
}): { url: string; init: RequestInit } {
	if (input.provider === "anthropic") {
		return {
			url: "https://api.anthropic.com/v1/models",
			init: {
				method: "GET",
				headers: {
					"anthropic-version": "2023-06-01",
					"x-api-key": input.apiKey,
				},
			},
		};
	}

	if (input.provider === "openrouter") {
		return {
			url: "https://openrouter.ai/api/v1/models",
			init: {
				method: "GET",
				headers: {
					Authorization: `Bearer ${input.apiKey}`,
				},
			},
		};
	}

	return {
		url: "https://api.openai.com/v1/models",
		init: {
			method: "GET",
			headers: {
				Authorization: `Bearer ${input.apiKey}`,
			},
		},
	};
}

function getKeyLast4(encryptedApiKey: string) {
	try {
		return getApiKeyLast4(decryptSecret(encryptedApiKey));
	} catch {
		return null;
	}
}

function getApiKeyLast4(apiKey: string) {
	const trimmedKey = apiKey.trim();
	if (!trimmedKey) {
		return null;
	}

	return trimmedKey.slice(-4);
}
