import { and, desc, eq } from "drizzle-orm";
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
import { decryptSecret, encryptSecret } from "./crypto";
import { getDb } from "./db";
import { aiProviders, auditLogs, servers, telegramConfigs } from "./db/schema";
import { getClientIp } from "./lib/get-client-ip";
import { resolveServerSshConfig } from "./server-records";
import { type SshAuthMethod, withSshConnection } from "./ssh";

type ProviderRequest = {
	provider: string;
	model?: string;
	apiKey?: string;
	baseUrl?: string;
};

type StoredProviderRecord = {
	provider: string;
	model: string;
	encryptedApiKey: string;
	baseUrl: string | null;
};

export type ProviderConfigSummary = {
	provider: AiProviderId;
	model: string;
	keyLast4: string | null;
	hasStoredKey: boolean;
	baseUrl?: string;
};

function decryptApiKey(encryptedStr: string): string {
	try {
		const decrypted = decryptSecret(encryptedStr);
		// Backward-compatibility: keys saved before the explicit baseUrl column
		// may have been stored as JSON {apiKey, baseUrl}. Unwrap if so.
		if (decrypted.startsWith("{")) {
			try {
				const parsed = JSON.parse(decrypted) as Record<string, unknown>;
				if (typeof parsed.apiKey === "string") {
					return parsed.apiKey;
				}
			} catch {
				// Not valid JSON — treat as a raw key starting with '{'
			}
		}
		return decrypted;
	} catch {
		return "";
	}
}

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

	// If API key is not supplied, try to retrieve it from existingRecord
	if (!resolvedApiKey) {
		if (existingRecord && existingRecord.provider === parsed.provider) {
			try {
				resolvedApiKey = decryptApiKey(existingRecord.encryptedApiKey);
				if (!resolvedBaseUrl) {
					resolvedBaseUrl = existingRecord.baseUrl ?? undefined;
				}
			} catch {
				return { error: "Stored API key could not be read. Paste a new key." };
			}
		}
	}

	// For OpenAI, Anthropic, and OpenRouter, API key is required.
	// For Ollama / Local and Custom / BYO, base URL is required. API key is optional.
	const option = getAiProviderOption(parsed.provider);
	if (option?.requiresBaseUrl && !resolvedBaseUrl) {
		return { error: "Base URL is required." };
	}

	if (!option?.requiresBaseUrl && !resolvedApiKey) {
		return { error: "API key is required." };
	}

	return { apiKey: resolvedApiKey, baseUrl: resolvedBaseUrl };
}

async function getLatestProviderRecord(userId: string) {
	const [record] = await getDb()
		.select({
			provider: aiProviders.provider,
			model: aiProviders.model,
			encryptedApiKey: aiProviders.encryptedApiKey,
			baseUrl: aiProviders.baseUrl,
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
	baseUrl?: string;
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
	baseUrl?: string;
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

	const option = getAiProviderOption(input.provider);
	if (option?.requiresBaseUrl) {
		const baseUrl = input.baseUrl || option.defaultBaseUrl || "";
		const url = baseUrl.endsWith("/")
			? `${baseUrl}models`
			: `${baseUrl}/models`;
		const headers: Record<string, string> = {};
		if (input.apiKey) {
			headers.Authorization = `Bearer ${input.apiKey}`;
		}
		return {
			url,
			init: {
				method: "GET",
				headers,
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

const PROVIDER_ENV_MAP: Record<
	AiProviderId,
	{ apiKey?: string; baseUrl?: string }
> = {
	openai: { apiKey: "OPENAI_API_KEY" },
	anthropic: { apiKey: "ANTHROPIC_API_KEY" },
	openrouter: { apiKey: "OPENROUTER_API_KEY" },
	ollama: {},
	custom: { apiKey: "OPENAI_API_KEY", baseUrl: "OPENAI_BASE_URL" },
};

async function getTelegramDeployInfo(userId: string) {
	const [record] = await getDb()
		.select({
			botToken: telegramConfigs.botToken,
			apiServerKey: telegramConfigs.apiServerKey,
			deployedServerId: telegramConfigs.deployedServerId,
			deployedServerHost: telegramConfigs.deployedServerHost,
		})
		.from(telegramConfigs)
		.where(
			and(
				eq(telegramConfigs.userId, userId),
				eq(telegramConfigs.isActive, true),
			),
		)
		.orderBy(desc(telegramConfigs.createdAt))
		.limit(1);

	if (!record?.apiServerKey || !record.deployedServerId) {
		return null;
	}

	return record as {
		botToken: string;
		apiServerKey: string;
		deployedServerId: string;
		deployedServerHost: string;
	};
}

async function getServerById(serverId: string) {
	const [row] = await getDb()
		.select({
			id: servers.id,
			host: servers.host,
			port: servers.port,
			username: servers.username,
			authMethod: servers.authMethod,
			encryptedCredential: servers.encryptedCredential,
			storeCredential: servers.storeCredential,
		})
		.from(servers)
		.where(eq(servers.id, serverId))
		.limit(1);

	return row ?? null;
}

function buildProviderEnvMap(
	provider: AiProviderId,
	apiKey: string,
	baseUrl: string | null | undefined,
): Record<string, string> {
	const mapping = PROVIDER_ENV_MAP[provider];
	if (!mapping) {
		return {};
	}

	const envVars: Record<string, string> = {};

	if (mapping.apiKey && apiKey) {
		envVars[mapping.apiKey] = apiKey;
	}

	if (mapping.baseUrl && baseUrl) {
		envVars[mapping.baseUrl] = baseUrl;
	}

	return envVars;
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

	let decryptedApiKey: string;
	try {
		decryptedApiKey = decryptSecret(providerRecord.encryptedApiKey);
	} catch {
		return context.json({ error: "Failed to decrypt API key." }, 500);
	}

	const providerEnvVars = buildProviderEnvMap(
		providerRecord.provider,
		decryptedApiKey,
		providerRecord.baseUrl,
	);

	const composeContent = buildHermesComposeContent({
		apiServerKey: telegramInfo.apiServerKey,
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

				const configResult = await ssh.execCommand(
					`docker exec hermes hermes config set model ${providerRecord.model}`,
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

function getApiKeyLast4(apiKey: string) {
	const trimmedKey = apiKey.trim();
	if (!trimmedKey) {
		return null;
	}

	return trimmedKey.slice(-4);
}
