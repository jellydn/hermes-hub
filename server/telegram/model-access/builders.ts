import { apiProviderOptions, isApiProviderId } from "#/lib/ai-providers";
import {
	getSubscriptionByStorageProviderId,
	getUserSubscriptionOption,
	isUserSubscriptionId,
} from "#/lib/user-subscriptions";
import { decryptStoredApiKey, getApiKeyLast4 } from "../../providers/records";
import type {
	AiProviderRow,
	AiUserSubscriptionRow,
	ModelAccessOption,
} from "./types";

// ── Decryption helper ────────────────────────────────────────────

export function decryptAndGetLast4(
	encrypted: string,
): { ok: true; keyLast4: string | null } | { ok: false } {
	if (!encrypted) return { ok: false };
	const decrypted = decryptStoredApiKey(encrypted);
	if (!decrypted.ok || !decrypted.apiKey) return { ok: false };
	return { ok: true, keyLast4: getApiKeyLast4(decrypted.apiKey) };
}

// ── Option builders ──────────────────────────────────────────────

export function buildApiProviderOption(
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

export function buildCredentialSubscriptionOption(
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

export function buildOAuthSubscriptionOption(
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
