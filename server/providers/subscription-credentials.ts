import type { CredentialSubscriptionOption } from "#/lib/user-subscriptions";
import type { UserSubscriptionConfigSummary } from "#shared/contracts/model-access";
import type { StoredProviderRecord } from "./config";
import { resolveStoredCredentials } from "./credential-resolution";
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
	input: {
		apiKey: string;
		baseUrl: string;
	},
	existingRecord: StoredProviderRecord | null,
	option: CredentialSubscriptionOption,
): { error: string } | { apiKey: string; baseUrl: string } {
	const resolved = resolveStoredCredentials(input, existingRecord, {
		storageId: option.storageProviderId,
		requiresApiKey: true,
		requiresBaseUrl: true,
	});

	if ("error" in resolved) {
		return { error: resolved.error };
	}

	return {
		apiKey: resolved.apiKey,
		baseUrl: resolved.baseUrl ?? "",
	};
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
