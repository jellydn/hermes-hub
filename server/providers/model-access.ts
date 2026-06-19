import type { ApiProviderId } from "#/lib/ai-providers";
import { getSubscriptionByStorageProviderId } from "#/lib/user-subscriptions";
import type { ModelAccessSnapshot } from "#shared/contracts/model-access";
import type { loadModelAccessRecords } from "./active-backend";
import { decryptStoredApiKey, getApiKeyLast4 } from "./records";

type ModelAccessRecords = Awaited<ReturnType<typeof loadModelAccessRecords>>;

type ActiveAccessSummary = {
	apiProvider: ModelAccessSnapshot["apiProvider"];
	subscription: ModelAccessSnapshot["subscription"];
};

function buildApiProviderSummary(
	record: NonNullable<ModelAccessRecords["apiRecord"]>,
): NonNullable<ModelAccessSnapshot["apiProvider"]> {
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
			: apiRecord && !getSubscriptionByStorageProviderId(apiRecord.provider)
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
