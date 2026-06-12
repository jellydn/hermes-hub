import type { Context } from "hono";
import {
	type ApiProviderId,
	getDefaultAiModel,
	getProviderCredentialPolicy,
	isApiProviderId,
	isValidAiModel,
} from "#/lib/ai-providers";
import {
	getCredentialSubscriptionOption,
	getDefaultSubscriptionModel,
	getUserSubscriptionOption,
	isUserSubscriptionId,
	isValidSubscriptionModel,
	subscriptionRequiresCredentials,
} from "#/lib/user-subscriptions";
import type { ModelAccessSnapshot } from "#shared/contracts/model-access";
import { getAuthSession } from "./auth";
import { clearDashboardCache } from "./dashboard";
import { getDb } from "./db";
import { getClientIp } from "./lib/get-client-ip";
import { loadModelAccessRecords } from "./providers/active-backend";
import {
	buildProviderEnvMap,
	buildSubscriptionEnvMap,
	type ProviderRequest,
	type StoredProviderRecord,
	type SubscriptionRequest,
} from "./providers/config";
import {
	ProviderConnectionError,
	verifyOpenAiCompatibleConnection,
	verifyProviderConnection,
} from "./providers/connection";
import { readApiBackendKeyForEnvMap } from "./providers/deploy-material";
import { buildModelAccessSnapshot } from "./providers/model-access";
import {
	activateApiProvider,
	activateCredentialSubscription,
	activateSubscription,
} from "./providers/model-access-persistence";
import {
	decryptStoredApiKey,
	getApiKeyLast4,
	getLatestProviderRecord,
} from "./providers/records";
import {
	buildCredentialSubscriptionSummary,
	buildSubscriptionCredentialEnvMap,
	readCredentialSubscriptionKeyMaterial,
	resolveSubscriptionCredentials,
} from "./providers/subscription-credentials";

export async function getModelAccessSnapshot(
	userId: string,
): Promise<ModelAccessSnapshot> {
	const records = await loadModelAccessRecords(userId);
	return buildModelAccessSnapshot(records);
}

/** @deprecated Use getModelAccessSnapshot(). */
export async function getCurrentProviderConfig(userId: string) {
	const snapshot = await getModelAccessSnapshot(userId);
	if (snapshot.activeBackend === "subscription" && snapshot.subscription) {
		return null;
	}

	return snapshot.apiProvider;
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
		await db.transaction(async (tx) => {
			await activateApiProvider(tx, {
				userId: session.user.id,
				provider: parsed.provider,
				apiKey: resolvedApiKey.apiKey,
				baseUrl: resolvedApiKey.baseUrl,
				model: parsed.model,
				ipAddress,
			});
		});

		clearDashboardCache();

		const credentialPolicy = getProviderCredentialPolicy(parsed.provider);
		const hasStoredKey = credentialPolicy.requiresApiKey
			? Boolean(resolvedApiKey.apiKey)
			: Boolean(resolvedApiKey.apiKey || resolvedApiKey.baseUrl);

		return context.json({
			provider: {
				kind: "api-provider",
				provider: parsed.provider,
				model: parsed.model,
				keyLast4: resolvedApiKey.apiKey
					? getApiKeyLast4(resolvedApiKey.apiKey)
					: null,
				hasStoredKey,
				baseUrl: resolvedApiKey.baseUrl || undefined,
			},
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unable to save AI provider settings";

		return context.json({ error: message }, 500);
	}
}

export async function saveSubscriptionConfig(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: SubscriptionRequest;

	try {
		payload = await context.req.json<SubscriptionRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const parsed = parseSubscriptionRequest(payload);
	if ("error" in parsed) {
		return context.json({ error: parsed.error }, 400);
	}

	const option = getUserSubscriptionOption(parsed.subscriptionProvider);
	if (!option) {
		return context.json(
			{ error: "Choose a valid subscription provider." },
			400,
		);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	try {
		if (subscriptionRequiresCredentials(parsed.subscriptionProvider)) {
			const credentialOption = getCredentialSubscriptionOption(
				parsed.subscriptionProvider,
			);
			if (!credentialOption) {
				return context.json(
					{ error: "Choose a valid subscription provider." },
					400,
				);
			}

			const existingRecord = await getLatestProviderRecord(session.user.id);
			const resolvedCredentials = resolveSubscriptionCredentials(
				parsed.subscriptionProvider,
				{
					apiKey: parsed.apiKey,
					baseUrl: parsed.baseUrl,
				},
				existingRecord,
				credentialOption,
			);
			if ("error" in resolvedCredentials) {
				return context.json({ error: resolvedCredentials.error }, 400);
			}

			await db.transaction(async (tx) => {
				await activateCredentialSubscription(tx, {
					userId: session.user.id,
					subscriptionProvider: parsed.subscriptionProvider,
					apiKey: resolvedCredentials.apiKey,
					baseUrl: resolvedCredentials.baseUrl,
					model: parsed.model,
					ipAddress,
				});
			});

			clearDashboardCache();

			return context.json({
				subscription: buildCredentialSubscriptionSummary(credentialOption, {
					model: parsed.model,
					apiKey: resolvedCredentials.apiKey,
					baseUrl: resolvedCredentials.baseUrl,
				}),
			});
		}

		await db.transaction(async (tx) => {
			await activateSubscription(tx, {
				userId: session.user.id,
				subscriptionProvider: parsed.subscriptionProvider,
				model: parsed.model,
				authMode: option.authMode,
				ipAddress,
			});
		});

		clearDashboardCache();

		return context.json({
			subscription: {
				kind: "subscription",
				subscriptionProvider: parsed.subscriptionProvider,
				model: parsed.model,
				authMode: option.authMode,
			},
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unable to save subscription settings";

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

export async function testSubscriptionConfig(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: SubscriptionRequest;

	try {
		payload = await context.req.json<SubscriptionRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const parsed = parseSubscriptionRequest(payload);
	if ("error" in parsed) {
		return context.json({ error: parsed.error }, 400);
	}

	if (!subscriptionRequiresCredentials(parsed.subscriptionProvider)) {
		return context.json(
			{ error: "This subscription does not support connection tests." },
			400,
		);
	}

	const credentialOption = getCredentialSubscriptionOption(
		parsed.subscriptionProvider,
	);
	if (!credentialOption) {
		return context.json(
			{ error: "Choose a valid subscription provider." },
			400,
		);
	}

	const existingRecord = await getLatestProviderRecord(session.user.id);
	const resolvedCredentials = resolveSubscriptionCredentials(
		parsed.subscriptionProvider,
		{
			apiKey: parsed.apiKey,
			baseUrl: parsed.baseUrl,
		},
		existingRecord,
		credentialOption,
	);
	if ("error" in resolvedCredentials) {
		return context.json({ error: resolvedCredentials.error }, 400);
	}

	try {
		await verifyOpenAiCompatibleConnection({
			apiKey: resolvedCredentials.apiKey,
			baseUrl: resolvedCredentials.baseUrl,
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
	if (!isApiProviderId(payload.provider)) {
		return { error: "Choose a valid API provider." };
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

function parseSubscriptionRequest(payload: SubscriptionRequest) {
	if (!isUserSubscriptionId(payload.subscriptionProvider)) {
		return { error: "Choose a valid subscription provider." };
	}

	const model =
		payload.model?.trim() ||
		getDefaultSubscriptionModel(payload.subscriptionProvider);
	if (!isValidSubscriptionModel(payload.subscriptionProvider, model)) {
		return { error: "Choose a valid model for the selected subscription." };
	}

	return {
		subscriptionProvider: payload.subscriptionProvider,
		model,
		apiKey: payload.apiKey?.trim() ?? "",
		baseUrl: payload.baseUrl?.trim() ?? "",
	};
}

function resolveProviderApiKey(
	parsed: {
		provider: ApiProviderId;
		model: string;
		apiKey: string;
		baseUrl?: string;
	},
	existingRecord: StoredProviderRecord | null,
) {
	let resolvedApiKey = parsed.apiKey;
	let resolvedBaseUrl = parsed.baseUrl;

	if (!resolvedApiKey && existingRecord?.provider === parsed.provider) {
		if (existingRecord.encryptedApiKey) {
			const decryptResult = decryptStoredApiKey(existingRecord.encryptedApiKey);
			if (!decryptResult.ok) {
				return { error: "Stored API key could not be read. Paste a new key." };
			}

			resolvedApiKey = decryptResult.apiKey;
		}

		if (!resolvedBaseUrl) {
			resolvedBaseUrl = existingRecord.baseUrl ?? undefined;
		}
	}

	const credentialPolicy = getProviderCredentialPolicy(parsed.provider);

	if (credentialPolicy.requiresBaseUrl && !resolvedBaseUrl) {
		return { error: "Base URL is required." };
	}

	if (credentialPolicy.requiresApiKey && !resolvedApiKey) {
		return { error: "API key is required." };
	}

	return { apiKey: resolvedApiKey, baseUrl: resolvedBaseUrl };
}

export async function getProviderDeployConfig(
	userId: string,
): Promise<{ envVars: Record<string, string>; model: string } | null> {
	const { activeBackend } = await loadModelAccessRecords(userId);
	if (!activeBackend) {
		return null;
	}

	if (activeBackend.kind === "subscription") {
		if (activeBackend.access === "credential") {
			const credentialOption = getCredentialSubscriptionOption(
				activeBackend.subscriptionProvider,
			);
			if (!credentialOption) {
				throw new Error("Unsupported credential-backed subscription.");
			}

			const keyMaterial = readCredentialSubscriptionKeyMaterial(activeBackend);
			if (!keyMaterial.ok) {
				throw new Error(keyMaterial.error);
			}

			return {
				envVars: buildSubscriptionCredentialEnvMap(
					credentialOption,
					keyMaterial.apiKey,
					activeBackend.baseUrl,
				),
				model: activeBackend.model,
			};
		}

		return {
			envVars: buildSubscriptionEnvMap(activeBackend.hermesProviderId),
			model: activeBackend.model,
		};
	}

	const { apiKey } = readApiBackendKeyForEnvMap(activeBackend);

	return {
		envVars: buildProviderEnvMap(
			activeBackend.provider,
			apiKey,
			activeBackend.baseUrl,
		),
		model: activeBackend.model,
	};
}

export { resolveActiveModelBackend } from "./providers/active-backend";
