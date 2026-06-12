import type { StoredProviderRecord } from "./config";
import { decryptStoredApiKey } from "./records";

export type StoredCredentialPolicy = {
	storageId: string;
	requiresApiKey: boolean;
	requiresBaseUrl: boolean;
};

export type StoredCredentialInput = {
	apiKey: string;
	baseUrl: string;
};

export function resolveStoredCredentials(
	input: StoredCredentialInput,
	existingRecord: StoredProviderRecord | null,
	policy: StoredCredentialPolicy,
): { apiKey: string; baseUrl: string | undefined } | { error: string } {
	let resolvedApiKey = input.apiKey;
	let resolvedBaseUrl = input.baseUrl;

	if (!resolvedApiKey && existingRecord?.provider === policy.storageId) {
		if (existingRecord.encryptedApiKey) {
			const decryptResult = decryptStoredApiKey(existingRecord.encryptedApiKey);
			if (!decryptResult.ok) {
				return { error: "Stored API key could not be read. Paste a new key." };
			}

			resolvedApiKey = decryptResult.apiKey;
		}

		if (!resolvedBaseUrl) {
			resolvedBaseUrl = existingRecord.baseUrl ?? "";
		}
	}

	if (policy.requiresBaseUrl && !resolvedBaseUrl) {
		return { error: "Base URL is required." };
	}

	if (policy.requiresApiKey && !resolvedApiKey) {
		return { error: "API key is required." };
	}

	return {
		apiKey: resolvedApiKey,
		baseUrl: resolvedBaseUrl || undefined,
	};
}
