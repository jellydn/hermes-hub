import type {
	CredentialSubscriptionOption,
	UserSubscriptionId,
} from "#/lib/user-subscriptions";
import type { UserSubscriptionConfigSummary } from "#shared/contracts/model-access";
import type { StoredProviderRecord } from "./config";
import { decryptStoredApiKey, getApiKeyLast4 } from "./records";

export function buildSubscriptionCredentialEnvMap(
	option: CredentialSubscriptionOption,
	apiKey: string,
	baseUrl: string | null | undefined,
) {
	const envVars: Record<string, string> = {
		HERMES_INFERENCE_PROVIDER: option.hermesProviderId,
	};

	if (apiKey) {
		envVars[option.deployEnv.apiKeyEnvVar] = apiKey;
	}

	if (baseUrl) {
		envVars[option.deployEnv.baseUrlEnvVar] = baseUrl;
	}

	return envVars;
}

export function buildCredentialSubscriptionSummary(
	option: CredentialSubscriptionOption,
	input: {
		model: string;
		apiKey: string | null;
		baseUrl: string | null | undefined;
	},
): UserSubscriptionConfigSummary {
	return {
		kind: "subscription",
		subscriptionProvider: option.id,
		model: input.model,
		authMode: option.authMode,
		keyLast4: input.apiKey ? getApiKeyLast4(input.apiKey) : null,
		hasStoredKey: Boolean(input.apiKey),
		baseUrl: input.baseUrl ?? undefined,
	};
}

export function buildStoredCredentialSubscriptionSummary(
	option: CredentialSubscriptionOption,
	record: Pick<StoredProviderRecord, "model" | "encryptedApiKey" | "baseUrl">,
): UserSubscriptionConfigSummary {
	const decryptResult = record.encryptedApiKey
		? decryptStoredApiKey(record.encryptedApiKey)
		: { ok: false as const };
	const storedApiKey =
		decryptResult.ok && decryptResult.apiKey ? decryptResult.apiKey : null;

	return buildCredentialSubscriptionSummary(option, {
		model: record.model,
		apiKey: storedApiKey,
		baseUrl: record.baseUrl,
	});
}

export function resolveSubscriptionCredentials(
	_subscriptionProvider: UserSubscriptionId,
	input: {
		apiKey: string;
		baseUrl: string;
	},
	existingRecord: StoredProviderRecord | null,
	option: CredentialSubscriptionOption,
) {
	let resolvedApiKey = input.apiKey;
	let resolvedBaseUrl = input.baseUrl;

	if (
		!resolvedApiKey &&
		existingRecord?.provider === option.storageProviderId
	) {
		if (existingRecord.encryptedApiKey) {
			const decryptResult = decryptStoredApiKey(existingRecord.encryptedApiKey);
			if (!decryptResult.ok) {
				return {
					error: "Stored API key could not be read. Paste a new key.",
				} as const;
			}

			resolvedApiKey = decryptResult.apiKey;
		}

		if (!resolvedBaseUrl) {
			resolvedBaseUrl = existingRecord.baseUrl ?? "";
		}
	}

	if (!resolvedBaseUrl) {
		return { error: "Base URL is required." } as const;
	}

	if (!resolvedApiKey) {
		return { error: "API key is required." } as const;
	}

	return {
		apiKey: resolvedApiKey,
		baseUrl: resolvedBaseUrl,
	} as const;
}

export function readCredentialSubscriptionKeyMaterial(backend: {
	encryptedApiKey: string;
	baseUrl: string | null;
}) {
	if (!backend.encryptedApiKey) {
		return { ok: false as const, error: "API key is required." };
	}

	const decryptResult = decryptStoredApiKey(backend.encryptedApiKey);
	if (!decryptResult.ok) {
		return {
			ok: false as const,
			error: "Stored API key could not be read. Paste a new key.",
		};
	}

	if (!decryptResult.apiKey) {
		return { ok: false as const, error: "API key is required." };
	}

	if (!backend.baseUrl) {
		return { ok: false as const, error: "Base URL is required." };
	}

	return { ok: true as const, apiKey: decryptResult.apiKey };
}
