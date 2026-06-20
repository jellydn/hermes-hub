import { and, desc, eq, inArray } from "drizzle-orm";
import type { ModelAccessSnapshot } from "../../shared/contracts/model-access";
import type {
	ModelAccessOption,
	ModelAccessOptionsResponse,
} from "../../shared/contracts/telegram-model-access";
import {
	type ApiProviderId,
	apiProviderOptions,
	formatAiProviderLabel,
	isApiProviderId,
} from "../../src/lib/ai-providers";
import {
	type CredentialSubscriptionOption,
	formatUserSubscriptionLabel,
	getSubscriptionByStorageProviderId,
	getSubscriptionHermesProviderId,
	getUserSubscriptionOption,
	isLegacyCodexProviderId,
	isUserSubscriptionId,
	type UserSubscriptionId,
	userSubscriptionOptions,
} from "../../src/lib/user-subscriptions";
import { getDb } from "../db";
import { aiProviders, aiUserSubscriptions } from "../db/schema";
import { PROVIDER_ENV_CONFIGS } from "./config";
import { decryptStoredApiKey, getApiKeyLast4 } from "./records";
import type { UserSubscriptionRecord } from "./subscription-records";

// ── Types ────────────────────────────────────────────────────────────

export type ActiveApiProviderBackend = {
	kind: "api-provider";
	provider: ApiProviderId;
	model: string;
	encryptedApiKey: string;
	baseUrl: string | null;
};

export type ActiveOAuthSubscriptionBackend = {
	kind: "subscription";
	access: "oauth";
	subscriptionProvider: UserSubscriptionId;
	model: string;
	authMode: string;
	hermesProviderId: string;
};

export type ActiveCredentialSubscriptionBackend = {
	kind: "subscription";
	access: "credential";
	subscriptionProvider: UserSubscriptionId;
	model: string;
	authMode: string;
	hermesProviderId: string;
	storageProviderId: string;
	encryptedApiKey: string;
	baseUrl: string | null;
};

export type ActiveSubscriptionBackend =
	| ActiveOAuthSubscriptionBackend
	| ActiveCredentialSubscriptionBackend;

export type ActiveModelBackend =
	| ActiveApiProviderBackend
	| ActiveSubscriptionBackend;

export type StoredProviderRecordInput = {
	provider: string;
	model: string;
	encryptedApiKey: string;
	baseUrl: string | null;
	isActive?: boolean;
};

type ModelAccessRecords = Awaited<ReturnType<typeof loadModelAccessRecords>>;

type ActiveAccessSummary = {
	apiProvider: ModelAccessSnapshot["apiProvider"];
	subscription: ModelAccessSnapshot["subscription"];
};

export type ResolvedOption =
	| {
			ok: true;
			kind: "api-provider" | "credential-subscription" | "oauth-subscription";
			provider: string;
			hermesProviderId: string;
			model: string;
			allowsCustomModel: boolean;
			fixedModels: string[];
			activeOptionIds: ActiveOptionIds;
	  }
	| { ok: false; error: string };

export type ActiveOptionIds = {
	providerIds: string[];
	subscriptionIds: string[];
};

type AiProviderRow = {
	id: string;
	provider: string;
	model: string;
	encryptedApiKey: string;
	baseUrl: string | null;
	isActive: boolean;
};

type AiUserSubscriptionRow = {
	id: string;
	subscriptionProvider: string;
	model: string;
	authMode: string;
	isActive: boolean;
};

// ── Logic from active-backend.ts ───────────────────────────────────

export function deriveActiveModelBackend(
	subscription: UserSubscriptionRecord | null,
	providerRecord: StoredProviderRecordInput | null,
): ActiveModelBackend | null {
	if (subscription) {
		return {
			kind: "subscription",
			access: "oauth",
			subscriptionProvider: subscription.subscriptionProvider,
			model: subscription.model,
			authMode: subscription.authMode,
			hermesProviderId: getSubscriptionHermesProviderId(
				subscription.subscriptionProvider,
			),
		};
	}

	if (!providerRecord?.isActive) {
		return null;
	}

	if (isLegacyCodexProviderId(providerRecord.provider)) {
		return {
			kind: "subscription",
			access: "oauth",
			subscriptionProvider: "chatgpt",
			model: providerRecord.model,
			authMode: "chatgpt",
			hermesProviderId: getSubscriptionHermesProviderId("chatgpt"),
		};
	}

	const credentialOption = getSubscriptionByStorageProviderId(
		providerRecord.provider,
	);
	if (credentialOption) {
		return {
			kind: "subscription",
			access: "credential",
			subscriptionProvider: credentialOption.id,
			model: providerRecord.model,
			authMode: credentialOption.authMode,
			hermesProviderId: credentialOption.hermesProviderId,
			storageProviderId: credentialOption.storageProviderId,
			encryptedApiKey: providerRecord.encryptedApiKey,
			baseUrl: providerRecord.baseUrl,
		};
	}

	if (!isApiProviderId(providerRecord.provider)) {
		return null;
	}

	return {
		kind: "api-provider",
		provider: providerRecord.provider,
		model: providerRecord.model,
		encryptedApiKey: providerRecord.encryptedApiKey,
		baseUrl: providerRecord.baseUrl,
	};
}

export async function loadModelAccessRecords(userId: string) {
	const credentialStorageIds = userSubscriptionOptions
		.filter(
			(o): o is CredentialSubscriptionOption => o.credentialKind === "api-key",
		)
		.map((o) => o.storageProviderId);

	const activeApiPromise = getDb()
		.select({
			provider: aiProviders.provider,
			model: aiProviders.model,
			encryptedApiKey: aiProviders.encryptedApiKey,
			baseUrl: aiProviders.baseUrl,
			isActive: aiProviders.isActive,
		})
		.from(aiProviders)
		.where(and(eq(aiProviders.userId, userId), eq(aiProviders.isActive, true)))
		.orderBy(desc(aiProviders.createdAt))
		.limit(1)
		.then((rows) => rows[0] || null);

	const activeSubPromise = getDb()
		.select({
			subscriptionProvider: aiUserSubscriptions.subscriptionProvider,
			model: aiUserSubscriptions.model,
			authMode: aiUserSubscriptions.authMode,
			isActive: aiUserSubscriptions.isActive,
		})
		.from(aiUserSubscriptions)
		.where(
			and(
				eq(aiUserSubscriptions.userId, userId),
				eq(aiUserSubscriptions.isActive, true),
			),
		)
		.orderBy(desc(aiUserSubscriptions.createdAt))
		.limit(1)
		.then((rows) => {
			const record = rows[0];
			if (!record || !isUserSubscriptionId(record.subscriptionProvider)) {
				return null;
			}
			return {
				subscriptionProvider: record.subscriptionProvider as UserSubscriptionId,
				model: record.model,
				authMode: record.authMode,
				isActive: record.isActive,
			};
		});

	const latestApiPromise = getDb()
		.select({
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
				inArray(aiProviders.provider, [
					"openai",
					"anthropic",
					"openrouter",
					"ollama",
					"custom",
				]),
			),
		)
		.orderBy(desc(aiProviders.createdAt))
		.limit(1)
		.then((rows) => rows[0] || null);

	const latestCredSubPromise =
		credentialStorageIds.length > 0
			? getDb()
					.select({
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
							inArray(aiProviders.provider, credentialStorageIds),
						),
					)
					.orderBy(desc(aiProviders.createdAt))
					.limit(1)
					.then((rows) => rows[0] || null)
			: Promise.resolve(null);

	const latestOAuthSubPromise = getDb()
		.select({
			subscriptionProvider: aiUserSubscriptions.subscriptionProvider,
			model: aiUserSubscriptions.model,
			authMode: aiUserSubscriptions.authMode,
			isActive: aiUserSubscriptions.isActive,
		})
		.from(aiUserSubscriptions)
		.where(eq(aiUserSubscriptions.userId, userId))
		.orderBy(desc(aiUserSubscriptions.createdAt))
		.limit(1)
		.then((rows) => {
			const record = rows[0];
			if (!record || !isUserSubscriptionId(record.subscriptionProvider)) {
				return null;
			}
			return {
				subscriptionProvider: record.subscriptionProvider as UserSubscriptionId,
				model: record.model,
				authMode: record.authMode,
				isActive: record.isActive,
			};
		});

	const [
		activeApiRecord,
		activeSubscriptionRecord,
		latestApiRecord,
		latestCredentialSubscriptionRecord,
		latestOAuthSubscriptionRecord,
	] = await Promise.all([
		activeApiPromise,
		activeSubPromise,
		latestApiPromise,
		latestCredSubPromise,
		latestOAuthSubPromise,
	]);

	return {
		apiRecord:
			activeApiRecord || latestApiRecord || latestCredentialSubscriptionRecord,
		subscriptionRecord:
			activeSubscriptionRecord || latestOAuthSubscriptionRecord,

		activeApiRecord,
		activeSubscriptionRecord,
		latestApiRecord,
		latestCredentialSubscriptionRecord,
		latestOAuthSubscriptionRecord,

		activeBackend: deriveActiveModelBackend(
			activeSubscriptionRecord,
			activeApiRecord,
		),
	};
}

export async function resolveActiveModelBackend(
	userId: string,
): Promise<ActiveModelBackend | null> {
	const { activeBackend } = await loadModelAccessRecords(userId);
	return activeBackend;
}

export function formatActiveBackendLabel(backend: ActiveModelBackend) {
	if (backend.kind === "subscription") {
		return formatUserSubscriptionLabel(backend.subscriptionProvider);
	}

	return formatAiProviderLabel(backend.provider);
}

export function formatModelAccessProviderLabel(
	provider: ApiProviderId | UserSubscriptionId,
) {
	if (isUserSubscriptionId(provider)) {
		return formatUserSubscriptionLabel(provider);
	}

	return formatAiProviderLabel(provider);
}

export function resolveDeployProviderLabel(backend: ActiveModelBackend) {
	return backend.kind === "subscription"
		? backend.subscriptionProvider
		: backend.provider;
}

// ── Logic from providers/model-access.ts ─────────────────────────────

function buildApiProviderSummary(
	record: NonNullable<ModelAccessRecords["apiRecord"]>,
): NonNullable<ModelAccessSnapshot["apiProvider"]> {
	if (!isApiProviderId(record.provider)) {
		throw new Error(`Invalid API provider ID: ${record.provider}`);
	}
	const decryptedApiKey = decryptStoredApiKey(record.encryptedApiKey);
	return {
		kind: "api-provider",
		provider: record.provider as ApiProviderId,
		model: record.model,
		keyLast4: decryptedApiKey.ok
			? getApiKeyLast4(decryptedApiKey.apiKey)
			: null,
		hasStoredKey: decryptedApiKey.ok,
		baseUrl: record.baseUrl ?? undefined,
	};
}

function buildStoredCredentialSubscriptionSummary(
	option: Parameters<
		typeof import("./subscription-credentials").buildStoredCredentialSubscriptionSummary
	>[0],
	record: NonNullable<ModelAccessRecords["apiRecord"]>,
): NonNullable<ModelAccessSnapshot["subscription"]> {
	const decryptedApiKey = decryptStoredApiKey(record.encryptedApiKey);
	return {
		kind: "subscription",
		subscriptionProvider: option.id,
		model: record.model,
		authMode: option.authMode,
		keyLast4: decryptedApiKey.ok
			? getApiKeyLast4(decryptedApiKey.apiKey)
			: null,
		hasStoredKey: decryptedApiKey.ok,
		baseUrl: record.baseUrl ?? undefined,
	};
}

function resolveActiveAccessSummary(
	records: ModelAccessRecords,
): ActiveAccessSummary {
	const {
		activeApiRecord,
		latestApiRecord,
		activeSubscriptionRecord,
		latestOAuthSubscriptionRecord,
		latestCredentialSubscriptionRecord,
		apiRecord,
		subscriptionRecord,
	} = records;

	const activeSubRec =
		activeSubscriptionRecord !== undefined
			? activeSubscriptionRecord
			: subscriptionRecord?.isActive
				? subscriptionRecord
				: null;

	const activeApiRec =
		activeApiRecord !== undefined
			? activeApiRecord
			: apiRecord?.isActive
				? apiRecord
				: null;

	let subscription: ModelAccessSnapshot["subscription"] = null;
	if (activeSubRec) {
		subscription = {
			kind: "subscription",
			subscriptionProvider: activeSubRec.subscriptionProvider,
			model: activeSubRec.model,
			authMode: activeSubRec.authMode,
		};
	} else if (activeApiRec) {
		const credentialOption = getSubscriptionByStorageProviderId(
			activeApiRec.provider,
		);
		if (credentialOption) {
			subscription = buildStoredCredentialSubscriptionSummary(
				credentialOption,
				activeApiRec,
			);
		}
	}

	let apiProvider: ModelAccessSnapshot["apiProvider"] = null;
	if (
		activeApiRec &&
		isApiProviderId(activeApiRec.provider) &&
		!getSubscriptionByStorageProviderId(activeApiRec.provider)
	) {
		apiProvider = buildApiProviderSummary(activeApiRec);
	}

	const latestSubRec =
		latestOAuthSubscriptionRecord !== undefined
			? latestOAuthSubscriptionRecord
			: subscriptionRecord;

	const latestApiRec =
		latestApiRecord !== undefined
			? latestApiRecord
			: apiRecord &&
					isApiProviderId(apiRecord.provider) &&
					!getSubscriptionByStorageProviderId(apiRecord.provider)
				? apiRecord
				: null;

	const latestCredSubRec =
		latestCredentialSubscriptionRecord !== undefined
			? latestCredentialSubscriptionRecord
			: apiRecord && getSubscriptionByStorageProviderId(apiRecord.provider)
				? apiRecord
				: null;

	if (!subscription) {
		if (latestSubRec) {
			subscription = {
				kind: "subscription",
				subscriptionProvider: latestSubRec.subscriptionProvider,
				model: latestSubRec.model,
				authMode: latestSubRec.authMode,
			};
		} else if (latestCredSubRec) {
			const credentialOption = getSubscriptionByStorageProviderId(
				latestCredSubRec.provider,
			);
			if (credentialOption) {
				subscription = buildStoredCredentialSubscriptionSummary(
					credentialOption,
					latestCredSubRec,
				);
			}
		}
	}

	if (!apiProvider && latestApiRec) {
		apiProvider = buildApiProviderSummary(latestApiRec);
	}

	return { apiProvider, subscription };
}

export function buildModelAccessSnapshot(
	records: ModelAccessRecords,
): ModelAccessSnapshot {
	const { apiProvider, subscription } = resolveActiveAccessSummary(records);

	return {
		apiProvider,
		subscription,
		activeBackend: records.activeBackend?.kind ?? null,
	};
}

// ── Logic from telegram/model-access.ts ──────────────────────────────

function decryptAndGetLast4(
	encrypted: string,
): { ok: true; keyLast4: string | null } | { ok: false } {
	if (!encrypted) return { ok: false };
	const decrypted = decryptStoredApiKey(encrypted);
	if (!decrypted.ok || !decrypted.apiKey) return { ok: false };
	return { ok: true, keyLast4: getApiKeyLast4(decrypted.apiKey) };
}

function buildApiProviderOption(
	record: AiProviderRow,
): ModelAccessOption | null {
	if (!isApiProviderId(record.provider)) return null;
	const option = apiProviderOptions.find((o) => o.id === record.provider);
	if (!option) return null;

	const dec = decryptAndGetLast4(record.encryptedApiKey);
	if (!dec.ok) return null;

	return {
		optionId: `api-provider:${record.id}`,
		kind: "api-provider",
		label: option.label,
		model: record.model,
		fixedModels: option.models.length > 0 ? [...option.models] : undefined,
		allowsCustomModel: option.requiresCustomModel || undefined,
		isActive: record.isActive,
		keyLast4: dec.keyLast4,
		baseUrl: record.baseUrl,
	};
}

function buildCredentialSubscriptionOption(
	record: AiProviderRow,
): ModelAccessOption | null {
	const credentialOption = getSubscriptionByStorageProviderId(record.provider);
	if (!credentialOption) return null;
	if (!isUserSubscriptionId(credentialOption.id)) return null;

	const subscriptionOption = getUserSubscriptionOption(credentialOption.id);
	if (!subscriptionOption) return null;

	const dec = decryptAndGetLast4(record.encryptedApiKey);
	if (!dec.ok) return null;

	return {
		optionId: `credential-subscription:${record.id}`,
		kind: "credential-subscription",
		label: subscriptionOption.label,
		model: record.model,
		fixedModels: [...subscriptionOption.models],
		isActive: record.isActive,
		keyLast4: dec.keyLast4,
		baseUrl: record.baseUrl,
	};
}

function buildOAuthSubscriptionOption(
	record: AiUserSubscriptionRow,
): ModelAccessOption | null {
	if (!isUserSubscriptionId(record.subscriptionProvider)) return null;
	const option = getUserSubscriptionOption(record.subscriptionProvider);
	if (!option) return null;

	return {
		optionId: `oauth-subscription:${record.id}`,
		kind: "oauth-subscription",
		label: option.label,
		model: record.model,
		fixedModels: [...option.models],
		isActive: record.isActive,
	};
}

async function getLatestProviderRows(
	userId: string,
	providers: string[],
): Promise<AiProviderRow[]> {
	if (providers.length === 0) return [];
	return getDb()
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
				inArray(aiProviders.provider, providers),
			),
		)
		.orderBy(desc(aiProviders.createdAt));
}

async function getLatestSubscriptionRows(
	userId: string,
	subProviders: string[],
): Promise<AiUserSubscriptionRow[]> {
	if (subProviders.length === 0) return [];
	return getDb()
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
				inArray(aiUserSubscriptions.subscriptionProvider, subProviders),
			),
		)
		.orderBy(desc(aiUserSubscriptions.createdAt));
}

function keepLatestBy<T>(rows: T[], keyFn: (r: T) => string): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const row of rows) {
		const key = keyFn(row);
		if (!seen.has(key)) {
			seen.add(key);
			result.push(row);
		}
	}
	return result;
}

export async function getModelAccessOptions(
	userId: string,
): Promise<ModelAccessOptionsResponse> {
	const options: ModelAccessOption[] = [];
	let activeOptionId: string | null = null;

	const collect = (option: ModelAccessOption | null) => {
		if (!option) return;
		if (option.isActive) activeOptionId = option.optionId;
		options.push(option);
	};

	// 1. Fetch all ai_providers rows in one query, partition by kind
	const allProviderTypes = await getDb()
		.select({ provider: aiProviders.provider })
		.from(aiProviders)
		.where(eq(aiProviders.userId, userId))
		.groupBy(aiProviders.provider);
	const allTypes = allProviderTypes.map((r) => r.provider);

	const apiTypes = allTypes.filter(isApiProviderId);
	const storageTypes = allTypes.filter((t) => !isApiProviderId(t));

	// 2. Batch-fetch latest rows per group (2 queries instead of N+M)
	const apiRows = keepLatestBy(
		await getLatestProviderRows(userId, apiTypes),
		(r) => r.provider,
	);
	for (const record of apiRows) collect(buildApiProviderOption(record));

	const storageRows = keepLatestBy(
		await getLatestProviderRows(userId, storageTypes),
		(r) => r.provider,
	);
	for (const record of storageRows)
		collect(buildCredentialSubscriptionOption(record));

	// 3. OAuth subscriptions (1 query)
	const subProviderTypes = await getDb()
		.select({ subscriptionProvider: aiUserSubscriptions.subscriptionProvider })
		.from(aiUserSubscriptions)
		.where(eq(aiUserSubscriptions.userId, userId))
		.groupBy(aiUserSubscriptions.subscriptionProvider);
	const subTypes = subProviderTypes
		.map((r) => r.subscriptionProvider)
		.filter(isUserSubscriptionId);

	const subRows = keepLatestBy(
		await getLatestSubscriptionRows(userId, subTypes),
		(r) => r.subscriptionProvider,
	);
	for (const record of subRows) collect(buildOAuthSubscriptionOption(record));

	return { options, activeOptionId };
}

export function parseOptionId(
	optionId: string,
): { kind: string; recordId: string } | null {
	const parts = optionId.split(":");
	if (parts.length !== 2) return null;
	return { kind: parts[0], recordId: parts[1] };
}

async function resolveApiProviderOption(
	userId: string,
	recordId: string,
): Promise<ResolvedOption> {
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

	if (!record) return { ok: false, error: "Option not found." };
	if (!isApiProviderId(record.provider)) {
		return { ok: false, error: "Invalid provider option." };
	}

	const providerConfig = PROVIDER_ENV_CONFIGS[record.provider as ApiProviderId];
	if (!providerConfig?.hermesProvider) {
		return {
			ok: false,
			error: "Provider does not have a valid inference provider mapping.",
		};
	}

	const option = apiProviderOptions.find(
		(o) => o.id === (record.provider as ApiProviderId),
	);
	if (!option) return { ok: false, error: "Invalid provider option." };

	return {
		ok: true,
		kind: "api-provider",
		provider: record.provider as ApiProviderId,
		hermesProviderId: providerConfig.hermesProvider,
		model: record.model,
		allowsCustomModel: option.requiresCustomModel ?? false,
		fixedModels: [...option.models],
		activeOptionIds: await findActiveOptionIds(
			userId,
			`api-provider:${recordId}`,
		),
	};
}

async function resolveCredentialSubscriptionOption(
	userId: string,
	recordId: string,
): Promise<ResolvedOption> {
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

	if (!record) return { ok: false, error: "Option not found." };

	const credentialOption = getSubscriptionByStorageProviderId(record.provider);
	if (!credentialOption || !isUserSubscriptionId(credentialOption.id)) {
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
			error: "Stored API key could not be read. Save the subscription again.",
		};
	}

	return {
		ok: true,
		kind: "credential-subscription",
		provider: credentialOption.id,
		hermesProviderId: credentialOption.hermesProviderId,
		model: record.model,
		allowsCustomModel: false,
		fixedModels: [...subOption.models],
		activeOptionIds: await findActiveOptionIds(
			userId,
			`credential-subscription:${recordId}`,
		),
	};
}

async function resolveOAuthSubscriptionOption(
	userId: string,
	recordId: string,
): Promise<ResolvedOption> {
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

	if (!record) return { ok: false, error: "Option not found." };
	if (!isUserSubscriptionId(record.subscriptionProvider)) {
		return { ok: false, error: "Invalid subscription option." };
	}

	const option = getUserSubscriptionOption(record.subscriptionProvider);
	if (!option) return { ok: false, error: "Invalid subscription option." };

	return {
		ok: true,
		kind: "oauth-subscription",
		provider: record.subscriptionProvider,
		hermesProviderId: option.hermesProviderId,
		model: record.model,
		allowsCustomModel: false,
		fixedModels: [...option.models],
		activeOptionIds: await findActiveOptionIds(
			userId,
			`oauth-subscription:${recordId}`,
		),
	};
}

export async function resolveSwitchOption(
	userId: string,
	optionId: string,
): Promise<ResolvedOption> {
	const parsed = parseOptionId(optionId);
	if (!parsed) return { ok: false, error: "Invalid option ID format." };

	switch (parsed.kind) {
		case "api-provider":
			return resolveApiProviderOption(userId, parsed.recordId);
		case "credential-subscription":
			return resolveCredentialSubscriptionOption(userId, parsed.recordId);
		case "oauth-subscription":
			return resolveOAuthSubscriptionOption(userId, parsed.recordId);
		default:
			return { ok: false, error: "Invalid option kind." };
	}
}

export async function findActiveOptionIds(
	userId: string,
	excludeOptionId: string,
): Promise<ActiveOptionIds> {
	const providerIds: string[] = [];
	const subscriptionIds: string[] = [];

	const apiRows = await getDb()
		.select({ id: aiProviders.id })
		.from(aiProviders)
		.where(and(eq(aiProviders.userId, userId), eq(aiProviders.isActive, true)));

	for (const row of apiRows) {
		const apiOptId = `api-provider:${row.id}`;
		const credOptId = `credential-subscription:${row.id}`;
		if (apiOptId !== excludeOptionId && credOptId !== excludeOptionId) {
			providerIds.push(row.id);
		}
	}

	const subRows = await getDb()
		.select({ id: aiUserSubscriptions.id })
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
			subscriptionIds.push(row.id);
		}
	}

	return { providerIds, subscriptionIds };
}
