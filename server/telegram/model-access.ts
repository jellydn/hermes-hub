import { and, desc, eq } from "drizzle-orm";

import {
	type ApiProviderId,
	apiProviderOptions,
	isApiProviderId,
} from "#/lib/ai-providers";
import {
	getSubscriptionByStorageProviderId,
	getUserSubscriptionOption,
	isUserSubscriptionId,
} from "#/lib/user-subscriptions";
import type {
	ModelAccessOption,
	ModelAccessOptionsResponse,
} from "#shared/contracts/telegram-model-access";
import { getDb } from "../db";
import { aiProviders, aiUserSubscriptions } from "../db/schema";
import { decryptStoredApiKey, getApiKeyLast4 } from "../providers/records";

/**
 * Returns all distinct `provider` values the user has saved in ai_providers.
 */
async function getUserProviderTypes(userId: string): Promise<string[]> {
	const rows = await getDb()
		.select({ provider: aiProviders.provider })
		.from(aiProviders)
		.where(eq(aiProviders.userId, userId))
		.groupBy(aiProviders.provider);
	return rows.map((r) => r.provider);
}

/**
 * Returns the latest saved row per provider type.
 */
type AiProviderRow = {
	id: string;
	provider: string;
	model: string;
	encryptedApiKey: string;
	baseUrl: string | null;
	isActive: boolean;
};

async function getLatestPerProvider(
	userId: string,
	providerType: string,
): Promise<AiProviderRow | null> {
	const [row] = await getDb()
		.select({
			id: aiProviders.id,
			provider: aiProviders.provider,
			model: aiProviders.model,
			encryptedApiKey: aiProviders.encryptedApiKey,
			baseUrl: aiProviders.baseUrl,
			isActive: aiProviders.isActive,
		})
		.from(aiProviders)
		.where(
			and(
				eq(aiProviders.userId, userId),
				eq(aiProviders.provider, providerType),
			),
		)
		.orderBy(desc(aiProviders.createdAt))
		.limit(1);

	return row ?? null;
}

/**
 * Returns all distinct subscriptionProvider values the user has saved.
 */
async function getUserSubscriptionProviderTypes(
	userId: string,
): Promise<string[]> {
	const rows = await getDb()
		.select({ subscriptionProvider: aiUserSubscriptions.subscriptionProvider })
		.from(aiUserSubscriptions)
		.where(eq(aiUserSubscriptions.userId, userId))
		.groupBy(aiUserSubscriptions.subscriptionProvider);
	return rows.map((r) => r.subscriptionProvider);
}

type AiUserSubscriptionRow = {
	id: string;
	subscriptionProvider: string;
	model: string;
	authMode: string;
	isActive: boolean;
};

async function getLatestPerSubscriptionProvider(
	userId: string,
	subscriptionProvider: string,
): Promise<AiUserSubscriptionRow | null> {
	const [row] = await getDb()
		.select({
			id: aiUserSubscriptions.id,
			subscriptionProvider: aiUserSubscriptions.subscriptionProvider,
			model: aiUserSubscriptions.model,
			authMode: aiUserSubscriptions.authMode,
			isActive: aiUserSubscriptions.isActive,
		})
		.from(aiUserSubscriptions)
		.where(
			and(
				eq(aiUserSubscriptions.userId, userId),
				eq(aiUserSubscriptions.subscriptionProvider, subscriptionProvider),
			),
		)
		.orderBy(desc(aiUserSubscriptions.createdAt))
		.limit(1);

	return row ?? null;
}

function isDeployable(record: AiProviderRow): boolean {
	if (!record.encryptedApiKey) {
		return false;
	}

	// For API providers that require a key, check it's decryptable
	if (isApiProviderId(record.provider)) {
		const option = apiProviderOptions.find((o) => o.id === record.provider);
		if (option && !option.requiresBaseUrl) {
			const decrypted = decryptStoredApiKey(record.encryptedApiKey);
			return decrypted.ok && Boolean(decrypted.apiKey);
		}
		// Ollama/custom may not require an API key but need base URL
		return true;
	}

	// For credential subscriptions stored in ai_providers
	const storedKey = decryptStoredApiKey(record.encryptedApiKey);
	return storedKey.ok && Boolean(storedKey.apiKey);
}

function buildApiProviderOption(
	record: AiProviderRow,
): ModelAccessOption | null {
	if (!isApiProviderId(record.provider)) {
		return null;
	}
	const option = apiProviderOptions.find((o) => o.id === record.provider);
	if (!option) {
		return null;
	}

	const decrypted = decryptStoredApiKey(record.encryptedApiKey);
	const keyLast4 =
		decrypted.ok && decrypted.apiKey ? getApiKeyLast4(decrypted.apiKey) : null;

	return {
		optionId: `api-provider:${record.id}`,
		kind: "api-provider",
		label: option.label,
		model: record.model,
		fixedModels: option.models.length > 0 ? [...option.models] : undefined,
		allowsCustomModel: option.requiresCustomModel || undefined,
		isActive: record.isActive,
		keyLast4,
		baseUrl: record.baseUrl,
	};
}

function buildCredentialSubscriptionOption(
	record: AiProviderRow,
): ModelAccessOption | null {
	const credentialOption = getSubscriptionByStorageProviderId(record.provider);
	if (!credentialOption) {
		return null;
	}
	if (!isUserSubscriptionId(credentialOption.id)) {
		return null;
	}

	const subscriptionOption = getUserSubscriptionOption(credentialOption.id);
	if (!subscriptionOption) {
		return null;
	}

	const decrypted = decryptStoredApiKey(record.encryptedApiKey);
	const keyLast4 =
		decrypted.ok && decrypted.apiKey ? getApiKeyLast4(decrypted.apiKey) : null;

	return {
		optionId: `credential-subscription:${record.id}`,
		kind: "credential-subscription",
		label: subscriptionOption.label,
		model: record.model,
		fixedModels: [...subscriptionOption.models],
		isActive: record.isActive,
		keyLast4,
		baseUrl: record.baseUrl,
	};
}

function buildOAuthSubscriptionOption(
	record: AiUserSubscriptionRow,
): ModelAccessOption | null {
	if (!isUserSubscriptionId(record.subscriptionProvider)) {
		return null;
	}
	const option = getUserSubscriptionOption(record.subscriptionProvider);
	if (!option) {
		return null;
	}

	return {
		optionId: `oauth-subscription:${record.id}`,
		kind: "oauth-subscription",
		label: option.label,
		model: record.model,
		fixedModels: [...option.models],
		isActive: record.isActive,
	};
}

export async function getModelAccessOptions(
	userId: string,
): Promise<ModelAccessOptionsResponse> {
	const options: ModelAccessOption[] = [];
	let activeOptionId: string | null = null;

	// 1. Collect api-provider rows (openai, anthropic, openrouter, ollama, custom)
	const apiProviderTypes = await getUserProviderTypes(userId);
	for (const providerType of apiProviderTypes) {
		if (!isApiProviderId(providerType)) {
			continue;
		}
		const record = await getLatestPerProvider(userId, providerType);
		if (!record || !isDeployable(record)) {
			continue;
		}
		const option = buildApiProviderOption(record);
		if (option) {
			if (option.isActive) {
				activeOptionId = option.optionId;
			}
			options.push(option);
		}
	}

	// 2. Collect credential subscription rows stored in ai_providers (mimo etc.)
	// These have providers that are storage provider IDs, not API provider IDs
	const allProviderTypes = await getUserProviderTypes(userId);
	for (const providerType of allProviderTypes) {
		if (isApiProviderId(providerType)) {
			continue; // Already handled above
		}
		const credentialOption = getSubscriptionByStorageProviderId(providerType);
		if (!credentialOption) {
			continue;
		}
		const record = await getLatestPerProvider(userId, providerType);
		if (!record || !isDeployable(record)) {
			continue;
		}
		const option = buildCredentialSubscriptionOption(record);
		if (option) {
			if (option.isActive) {
				activeOptionId = option.optionId;
			}
			options.push(option);
		}
	}

	// 3. Collect OAuth subscription rows (chatgpt)
	const subscriptionProviderTypes =
		await getUserSubscriptionProviderTypes(userId);
	for (const subProvider of subscriptionProviderTypes) {
		if (!isUserSubscriptionId(subProvider)) {
			continue;
		}
		const record = await getLatestPerSubscriptionProvider(userId, subProvider);
		if (!record) {
			continue;
		}
		const option = buildOAuthSubscriptionOption(record);
		if (option) {
			if (option.isActive) {
				activeOptionId = option.optionId;
			}
			options.push(option);
		}
	}

	return { options, activeOptionId };
}

/**
 * Resolve a saved row from an optionId for the given user.
 * Returns the resolved backend info or a string error.
 */
export type ResolvedOption =
	| {
			ok: true;
			kind: "api-provider" | "credential-subscription" | "oauth-subscription";
			provider: ApiProviderId;
			hermesProviderId: string;
			model: string;
			allowsCustomModel: boolean;
			fixedModels: string[];
			activeOptionIds: string[];
	  }
	| { ok: false; error: string };

export async function resolveSwitchOption(
	userId: string,
	optionId: string,
): Promise<ResolvedOption> {
	const parts = optionId.split(":");
	if (parts.length !== 2) {
		return { ok: false, error: "Invalid option ID format." };
	}
	const [kind, recordId] = parts;

	if (kind === "api-provider" || kind === "credential-subscription") {
		const [record] = await getDb()
			.select({
				id: aiProviders.id,
				provider: aiProviders.provider,
				model: aiProviders.model,
				encryptedApiKey: aiProviders.encryptedApiKey,
				baseUrl: aiProviders.baseUrl,
			})
			.from(aiProviders)
			.where(and(eq(aiProviders.id, recordId), eq(aiProviders.userId, userId)))
			.limit(1);

		if (!record) {
			return { ok: false, error: "Option not found." };
		}

		if (kind === "credential-subscription") {
			const credentialOption = getSubscriptionByStorageProviderId(
				record.provider,
			);
			if (!credentialOption) {
				return { ok: false, error: "Invalid subscription option." };
			}
			if (!isUserSubscriptionId(credentialOption.id)) {
				return { ok: false, error: "Invalid subscription option." };
			}
			const subOption = getUserSubscriptionOption(credentialOption.id);
			if (!subOption) {
				return { ok: false, error: "Invalid subscription option." };
			}

			const decrypted = decryptStoredApiKey(record.encryptedApiKey);
			if (!decrypted.ok || !decrypted.apiKey) {
				return {
					ok: false,
					error:
						"Stored API key could not be read. Save the subscription again.",
				};
			}

			return {
				ok: true,
				kind: "credential-subscription",
				provider: credentialOption.id as unknown as ApiProviderId,
				hermesProviderId: credentialOption.hermesProviderId,
				model: record.model,
				allowsCustomModel: false,
				fixedModels: [...subOption.models],
				activeOptionIds: await findActiveOptionIds(userId, optionId),
			};
		}

		// api-provider
		if (!isApiProviderId(record.provider)) {
			return { ok: false, error: "Invalid provider option." };
		}
		const providerConfigMap = await import("../providers/config").then(
			(m) => m.PROVIDER_ENV_CONFIGS,
		);
		const providerConfig = providerConfigMap[record.provider];
		if (!providerConfig?.hermesProvider) {
			return {
				ok: false,
				error: "Provider does not have a valid inference provider mapping.",
			};
		}

		const option = apiProviderOptions.find((o) => o.id === record.provider);
		if (!option) {
			return { ok: false, error: "Invalid provider option." };
		}

		return {
			ok: true,
			kind: "api-provider",
			provider: record.provider,
			hermesProviderId: providerConfig.hermesProvider,
			model: record.model,
			allowsCustomModel: option.requiresCustomModel ?? false,
			fixedModels: [...option.models],
			activeOptionIds: await findActiveOptionIds(userId, optionId),
		};
	}

	if (kind === "oauth-subscription") {
		const [record] = await getDb()
			.select({
				id: aiUserSubscriptions.id,
				subscriptionProvider: aiUserSubscriptions.subscriptionProvider,
				model: aiUserSubscriptions.model,
			})
			.from(aiUserSubscriptions)
			.where(
				and(
					eq(aiUserSubscriptions.id, recordId),
					eq(aiUserSubscriptions.userId, userId),
				),
			)
			.limit(1);

		if (!record) {
			return { ok: false, error: "Option not found." };
		}
		if (!isUserSubscriptionId(record.subscriptionProvider)) {
			return { ok: false, error: "Invalid subscription option." };
		}

		const option = getUserSubscriptionOption(record.subscriptionProvider);
		if (!option) {
			return { ok: false, error: "Invalid subscription option." };
		}

		return {
			ok: true,
			kind: "oauth-subscription",
			provider: record.subscriptionProvider as unknown as ApiProviderId,
			hermesProviderId: option.hermesProviderId,
			model: record.model,
			allowsCustomModel: false,
			fixedModels: [...option.models],
			activeOptionIds: await findActiveOptionIds(userId, optionId),
		};
	}

	return { ok: false, error: "Invalid option kind." };
}

/**
 * Find the IDs of all currently active ai_providers and ai_user_subscriptions rows
 * for the user, excluding the one being switched to (so we can deactivate them).
 */
export async function findActiveOptionIds(
	userId: string,
	excludeOptionId: string,
): Promise<string[]> {
	const ids: string[] = [];

	const apiRows = await getDb()
		.select({
			id: aiProviders.id,
			isActive: aiProviders.isActive,
		})
		.from(aiProviders)
		.where(and(eq(aiProviders.userId, userId), eq(aiProviders.isActive, true)));

	for (const row of apiRows) {
		const apiOptId = `api-provider:${row.id}`;
		const credOptId = `credential-subscription:${row.id}`;
		if (apiOptId !== excludeOptionId && credOptId !== excludeOptionId) {
			ids.push(row.id);
		}
	}

	const subRows = await getDb()
		.select({
			id: aiUserSubscriptions.id,
			isActive: aiUserSubscriptions.isActive,
		})
		.from(aiUserSubscriptions)
		.where(
			and(
				eq(aiUserSubscriptions.userId, userId),
				eq(aiUserSubscriptions.isActive, true),
			),
		);

	for (const row of subRows) {
		const subOptId = `oauth-subscription:${row.id}`;
		if (subOptId !== excludeOptionId) {
			ids.push(row.id);
		}
	}

	return ids;
}
