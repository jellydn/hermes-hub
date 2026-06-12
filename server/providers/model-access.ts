import { type ApiProviderId, isApiProviderId } from "#/lib/ai-providers";
import { getSubscriptionByStorageProviderId } from "#/lib/user-subscriptions";
import type { ModelAccessSnapshot } from "#shared/contracts/model-access";
import type { loadModelAccessRecords } from "./active-backend";
import { decryptStoredApiKey, getApiKeyLast4 } from "./records";
import { buildStoredCredentialSubscriptionSummary } from "./subscription-credentials";

type ModelAccessRecords = Awaited<ReturnType<typeof loadModelAccessRecords>>;

type ActiveAccessSummary = {
	apiProvider: ModelAccessSnapshot["apiProvider"];
	subscription: ModelAccessSnapshot["subscription"];
};

function buildApiProviderSummary(
	record: NonNullable<ModelAccessRecords["apiRecord"]>,
) {
	const decryptResult = record.encryptedApiKey
		? decryptStoredApiKey(record.encryptedApiKey)
		: { ok: false as const };
	const storedApiKey =
		decryptResult.ok && decryptResult.apiKey ? decryptResult.apiKey : null;

	return {
		kind: "api-provider" as const,
		provider: record.provider as ApiProviderId,
		model: record.model,
		keyLast4: storedApiKey ? getApiKeyLast4(storedApiKey) : null,
		hasStoredKey: Boolean(storedApiKey),
		baseUrl: record.baseUrl ?? undefined,
	};
}

function resolveActiveAccessSummary(
	records: ModelAccessRecords,
): ActiveAccessSummary {
	const { apiRecord, subscriptionRecord } = records;

	if (subscriptionRecord) {
		return {
			apiProvider: null,
			subscription: {
				kind: "subscription",
				subscriptionProvider: subscriptionRecord.subscriptionProvider,
				model: subscriptionRecord.model,
				authMode: subscriptionRecord.authMode,
			},
		};
	}

	const credentialOption =
		apiRecord?.isActive && apiRecord.provider
			? getSubscriptionByStorageProviderId(apiRecord.provider)
			: null;

	if (credentialOption && apiRecord) {
		return {
			apiProvider: null,
			subscription: buildStoredCredentialSubscriptionSummary(
				credentialOption,
				apiRecord,
			),
		};
	}

	if (apiRecord?.isActive && isApiProviderId(apiRecord.provider)) {
		return {
			apiProvider: buildApiProviderSummary(apiRecord),
			subscription: null,
		};
	}

	return {
		apiProvider: null,
		subscription: null,
	};
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
