import type { CredentialSubscriptionOption } from "#/lib/user-subscriptions";
import type { UserSubscriptionConfigSummary } from "#shared/contracts/model-access";
import { getCommandCodeProxyBaseUrl } from "../commandcode/proxy";
import {
	deriveCustomProviderApiKeyEnvVar,
	type StoredProviderRecord,
} from "./config";
import { resolveStoredCredentials } from "./credential-resolution";
import { decryptStoredApiKey, getApiKeyLast4 } from "./records";

export function buildSubscriptionCredentialEnvMap(
	option: CredentialSubscriptionOption,
	apiKey: string,
	baseUrl: string | null | undefined,
) {
	const deployBaseUrl =
		option.id === "commandcode" ? getCommandCodeProxyBaseUrl() : baseUrl;
	const envVars: Record<string, string> = {
		HERMES_INFERENCE_PROVIDER: option.hermesProviderId,
	};

	if (apiKey) {
		envVars[option.deployEnv.apiKeyEnvVar] = apiKey;
	}

	if (deployBaseUrl) {
		envVars[option.deployEnv.baseUrlEnvVar] = deployBaseUrl;
	}

	// When the Hermes provider is "custom" (OpenAI-compatible mode), the
	// Hermes container also reads OPENAI_API_KEY and CUSTOM_BASE_URL /
	// OPENAI_BASE_URL. Credential subscriptions like Command Code use the
	// custom provider, so mirror the API-provider path (buildProviderEnvMap)
	// to ensure the container can authenticate and reach the endpoint.
	if (option.hermesProviderId === "custom") {
		if (apiKey) {
			envVars.OPENAI_API_KEY = apiKey;
			const customApiKeyEnvVar =
				deriveCustomProviderApiKeyEnvVar(deployBaseUrl);
			if (customApiKeyEnvVar) {
				envVars[customApiKeyEnvVar] = apiKey;
			}
		}
		if (deployBaseUrl) {
			envVars.CUSTOM_BASE_URL = deployBaseUrl;
			envVars.OPENAI_BASE_URL = deployBaseUrl;
		}
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
	let baseUrl = input.baseUrl;
	if (option.id === "commandcode") {
		try {
			baseUrl = getCommandCodeProxyBaseUrl();
		} catch (error) {
			return {
				error:
					error instanceof Error
						? error.message
						: "Unable to resolve the Command Code proxy URL.",
			};
		}
	}

	const resolved = resolveStoredCredentials(
		{ ...input, baseUrl },
		existingRecord,
		{
			storageId: option.storageProviderId,
			requiresApiKey: true,
			requiresBaseUrl: true,
		},
	);

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
