import { isApiProviderId } from "#/lib/ai-providers";
import type { ModelAccessSnapshot } from "#shared/contracts/model-access";
import type { loadModelAccessRecords } from "./active-backend";
import { decryptStoredApiKey, getApiKeyLast4 } from "./records";

type ModelAccessRecords = Awaited<ReturnType<typeof loadModelAccessRecords>>;

export function buildModelAccessSnapshot(
	records: ModelAccessRecords,
): ModelAccessSnapshot {
	const { apiRecord, subscriptionRecord, activeBackend } = records;

	const apiProvider =
		apiRecord?.isActive && isApiProviderId(apiRecord.provider)
			? (() => {
					const decryptResult = apiRecord.encryptedApiKey
						? decryptStoredApiKey(apiRecord.encryptedApiKey)
						: { ok: false as const };
					const storedApiKey =
						decryptResult.ok && decryptResult.apiKey
							? decryptResult.apiKey
							: null;

					return {
						kind: "api-provider" as const,
						provider: apiRecord.provider,
						model: apiRecord.model,
						keyLast4: storedApiKey ? getApiKeyLast4(storedApiKey) : null,
						hasStoredKey: Boolean(storedApiKey),
						baseUrl: apiRecord.baseUrl ?? undefined,
					};
				})()
			: null;

	const subscription = subscriptionRecord
		? {
				kind: "subscription" as const,
				subscriptionProvider: subscriptionRecord.subscriptionProvider,
				model: subscriptionRecord.model,
				authMode: subscriptionRecord.authMode,
			}
		: null;

	return {
		apiProvider,
		subscription,
		activeBackend: activeBackend?.kind ?? null,
	};
}
