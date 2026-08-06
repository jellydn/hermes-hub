// ── Switch Options ─────────────────────────────────────────────────

import { and, desc, eq, inArray } from "drizzle-orm";
import type {
	ModelAccessOption,
	ModelAccessOptionKind,
	ModelAccessOptionsResponse,
} from "../../../shared/contracts/telegram-model-access";
import {
	apiProviderOptions,
	isApiProviderId,
} from "../../../src/lib/ai-providers";
import {
	getSubscriptionByStorageProviderId,
	getUserSubscriptionOption,
	isUserSubscriptionId,
} from "../../../src/lib/user-subscriptions";
import { getDb } from "../../db";
import { aiProviders, aiUserSubscriptions } from "../../db/schema";
import { PROVIDER_ENV_CONFIGS } from "../config";
import { decryptStoredApiKey } from "../records";
import { decryptAndGetLast4 } from "./helpers";
import type {
	ActiveOptionIds,
	AiProviderRow,
	AiUserSubscriptionRow,
	ProviderRecordForOption,
	ResolvedOption,
} from "./types";

async function fetchProviderRecord(
	userId: string,
	recordId: string,
): Promise<ProviderRecordForOption | null> {
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

	return record ?? null;
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
		allowsCustomModel: true,
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
		allowsCustomModel: true,
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
		allowsCustomModel: true,
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

	const collect = (option: ModelAccessOption | null) => {
		if (!option) return;
		options.push(option);
	};

	// 1. Fetch distinct provider and subscription types in parallel
	const [allProviderTypes, subProviderTypes] = await Promise.all([
		getDb()
			.select({ provider: aiProviders.provider })
			.from(aiProviders)
			.where(eq(aiProviders.userId, userId))
			.groupBy(aiProviders.provider),
		getDb()
			.select({
				subscriptionProvider: aiUserSubscriptions.subscriptionProvider,
			})
			.from(aiUserSubscriptions)
			.where(eq(aiUserSubscriptions.userId, userId))
			.groupBy(aiUserSubscriptions.subscriptionProvider),
	]);

	const allTypes = allProviderTypes.map((r) => r.provider);
	const apiTypes = allTypes.filter(isApiProviderId);
	const storageTypes = allTypes.filter((t) => !isApiProviderId(t));
	const subTypes = subProviderTypes
		.map((r) => r.subscriptionProvider)
		.filter(isUserSubscriptionId);

	// 2. Batch-fetch latest rows per group in parallel
	const [apiRowsRaw, storageRowsRaw, subRowsRaw] = await Promise.all([
		getLatestProviderRows(userId, apiTypes),
		getLatestProviderRows(userId, storageTypes),
		getLatestSubscriptionRows(userId, subTypes),
	]);

	const apiRows = keepLatestBy(apiRowsRaw, (r) => r.provider);
	for (const record of apiRows) collect(buildApiProviderOption(record));

	const storageRows = keepLatestBy(storageRowsRaw, (r) => r.provider);
	for (const record of storageRows)
		collect(buildCredentialSubscriptionOption(record));

	const subRows = keepLatestBy(subRowsRaw, (r) => r.subscriptionProvider);
	for (const record of subRows) collect(buildOAuthSubscriptionOption(record));

	const activeOption = options.find((o) => o.isActive);
	return { options, activeOptionId: activeOption?.optionId ?? null };
}

export function parseOptionId(
	optionId: string,
): { kind: ModelAccessOptionKind; recordId: string } | null {
	const parts = optionId.split(":");
	if (parts.length !== 2) return null;
	if (
		parts[0] !== "api-provider" &&
		parts[0] !== "credential-subscription" &&
		parts[0] !== "oauth-subscription"
	) {
		return null;
	}
	return { kind: parts[0], recordId: parts[1] };
}

async function resolveApiProviderOption(
	userId: string,
	recordId: string,
): Promise<ResolvedOption> {
	const record = await fetchProviderRecord(userId, recordId);
	if (!record) return { ok: false, error: "Option not found." };
	if (!isApiProviderId(record.provider)) {
		return { ok: false, error: "Invalid provider option." };
	}

	const providerConfig = PROVIDER_ENV_CONFIGS[record.provider];
	if (!providerConfig?.hermesProvider) {
		return {
			ok: false,
			error: "Provider does not have a valid inference provider mapping.",
		};
	}

	const option = apiProviderOptions.find((o) => o.id === record.provider);
	if (!option) return { ok: false, error: "Invalid provider option." };

	return {
		ok: true,
		kind: "api-provider",
		provider: record.provider,
		hermesProviderId: providerConfig.hermesProvider,
		model: record.model,
		allowsCustomModel: true,
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
	const record = await fetchProviderRecord(userId, recordId);
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
		allowsCustomModel: true,
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
		allowsCustomModel: true,
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

	const [apiRows, subRows] = await Promise.all([
		getDb()
			.select({ id: aiProviders.id })
			.from(aiProviders)
			.where(
				and(eq(aiProviders.userId, userId), eq(aiProviders.isActive, true)),
			),
		getDb()
			.select({ id: aiUserSubscriptions.id })
			.from(aiUserSubscriptions)
			.where(
				and(
					eq(aiUserSubscriptions.userId, userId),
					eq(aiUserSubscriptions.isActive, true),
				),
			),
	]);

	for (const row of apiRows) {
		const apiOptId = `api-provider:${row.id}`;
		const credOptId = `credential-subscription:${row.id}`;
		if (apiOptId !== excludeOptionId && credOptId !== excludeOptionId) {
			providerIds.push(row.id);
		}
	}

	for (const row of subRows) {
		const subOptId = `oauth-subscription:${row.id}`;
		if (subOptId !== excludeOptionId) {
			subscriptionIds.push(row.id);
		}
	}

	return { providerIds, subscriptionIds };
}
