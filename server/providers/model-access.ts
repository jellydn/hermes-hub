import { type ApiProviderId, isApiProviderId } from "#/lib/ai-providers";
import { getSubscriptionByStorageProviderId } from "#/lib/user-subscriptions";
import type { ModelAccessSnapshot } from "#shared/contracts/model-access";
import type { loadModelAccessRecords } from "./active-backend";
import { decryptStoredApiKey, getApiKeyLast4 } from "./records";
import { buildStoredCredentialSubscriptionSummary } from "./subscription-credentials";

type ModelAccessRecords = Awaited<ReturnType<typeof loadModelAccessRecords>>;

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

export function buildModelAccessSnapshot(
	records: ModelAccessRecords,
): ModelAccessSnapshot {
	const { apiRecord, subscriptionRecord } = records;

	const credentialOption =
		apiRecord?.isActive && apiRecord.provider
			? getSubscriptionByStorageProviderId(apiRecord.provider)
			: null;

	const apiProvider =
		apiRecord?.isActive &&
		isApiProviderId(apiRecord.provider) &&
		!credentialOption
			? buildApiProviderSummary(apiRecord)
			: null;

	const subscription = subscriptionRecord
		? {
				kind: "subscription" as const,
				subscriptionProvider: subscriptionRecord.subscriptionProvider,
				model: subscriptionRecord.model,
				authMode: subscriptionRecord.authMode,
			}
		: credentialOption && apiRecord
			? buildStoredCredentialSubscriptionSummary(credentialOption, apiRecord)
			: null;

	return {
		apiProvider,
		subscription,
		activeBackend: records.activeBackend?.kind ?? null,
	};
}
