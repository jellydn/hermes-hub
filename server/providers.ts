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
} from "#/lib/user-subscriptions";
import type { ModelAccessSnapshot } from "#shared/contracts/model-access";
import { getAuthSession } from "./auth";
import { clearDashboardCache } from "./dashboard";
import { getDb } from "./db";
import { getClientIp } from "./lib/get-client-ip";
import {
	buildProviderEnvMap,
	buildSubscriptionEnvMap,
	type ProviderRequest,
	type StoredProviderRecord,
	type SubscriptionRequest,
} from "./providers/config";
import {
	ProviderConnectionError,
	verifyCommandCodeConnection,
	verifyOpenAiCompatibleConnection,
	verifyProviderConnection,
} from "./providers/connection";
import { resolveStoredCredentials } from "./providers/credential-resolution";
import { readApiBackendKeyForEnvMap } from "./providers/deploy-material";
import {
	type ActiveModelBackend,
	buildModelAccessSnapshot,
	loadModelAccessRecords,
} from "./providers/model-access";

import {
	activateApiProvider,
	activateCredentialSubscription,
	activateSubscription,
} from "./providers/model-access-persistence";
import { getApiKeyLast4, getLatestProviderRecord } from "./providers/records";
import {
	buildCredentialSubscriptionSummary,
	buildSubscriptionCredentialEnvMap,
	readCredentialSubscriptionKeyMaterial,
} from "./providers/subscription-credentials";
import { loadCredentialSubscriptionCredentials } from "./providers/subscription-request";

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

	const parsed = parseProviderRequest(payload);
	if ("error" in parsed) {
		return context.json({ error: parsed.error }, 400);
	}

	const existingRecord = await getLatestProviderRecord(
		session.user.id,
		parsed.provider,
	);
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
	const credentialOption = getCredentialSubscriptionOption(
		parsed.subscriptionProvider,
	);

	try {
		if (credentialOption) {
			const credentialContext = await loadCredentialSubscriptionCredentials(
				session.user.id,
				parsed,
			);
			if ("error" in credentialContext) {
				return context.json({ error: credentialContext.error }, 400);
			}

			await db.transaction(async (tx) => {
				await activateCredentialSubscription(tx, {
					userId: session.user.id,
					subscriptionProvider: parsed.subscriptionProvider,
					apiKey: credentialContext.credentials.apiKey,
					baseUrl: credentialContext.credentials.baseUrl,
					model: parsed.model,
					ipAddress,
				});
			});

			clearDashboardCache();

			return context.json({
				subscription: buildCredentialSubscriptionSummary(
					credentialContext.option,
					{
						model: parsed.model,
						apiKey: credentialContext.credentials.apiKey,
						baseUrl: credentialContext.credentials.baseUrl,
					},
				),
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

	const parsed = parseProviderRequest(payload);
	if ("error" in parsed) {
		return context.json({ error: parsed.error }, 400);
	}

	const existingRecord = await getLatestProviderRecord(
		session.user.id,
		parsed.provider,
	);
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

	const credentialContext = await loadCredentialSubscriptionCredentials(
		session.user.id,
		parsed,
	);
	if ("error" in credentialContext) {
		return context.json({ error: credentialContext.error }, 400);
	}

	try {
		if (credentialContext.option.id === "commandcode") {
			await verifyCommandCodeConnection({
				apiKey: credentialContext.credentials.apiKey,
				model: parsed.model,
			});
		} else {
			await verifyOpenAiCompatibleConnection({
				apiKey: credentialContext.credentials.apiKey,
				baseUrl: credentialContext.credentials.baseUrl,
			});
		}

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
	const credentialPolicy = getProviderCredentialPolicy(parsed.provider);

	return resolveStoredCredentials(
		{
			apiKey: parsed.apiKey,
			baseUrl: parsed.baseUrl ?? "",
		},
		existingRecord,
		{
			storageId: parsed.provider,
			requiresApiKey: credentialPolicy.requiresApiKey,
			requiresBaseUrl: credentialPolicy.requiresBaseUrl,
		},
	);
}

export function buildDeployConfig(activeBackend: ActiveModelBackend): {
	envVars: Record<string, string>;
	model: string;
} {
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

export async function getProviderDeployConfig(
	userId: string,
): Promise<{ envVars: Record<string, string>; model: string } | null> {
	const { activeBackend } = await loadModelAccessRecords(userId);
	if (!activeBackend) {
		return null;
	}

	return buildDeployConfig(activeBackend);
}

export { resolveActiveModelBackend } from "./providers/model-access";
