import { getProviderCredentialPolicy } from "#/lib/ai-providers";
import { PROVIDER_ENV_CONFIGS } from "./config";
import type {
	ActiveApiProviderBackend,
	ActiveModelBackend,
} from "./model-access";
import { resolveDeployProviderLabel } from "./model-access";
import { decryptStoredApiKey } from "./records";

export const UNREADABLE_API_KEY_ERROR =
	"Stored API key could not be read. Paste a new key.";

export type ApiBackendKeyMaterial =
	| { ok: true; apiKey: string }
	| { ok: false; error: typeof UNREADABLE_API_KEY_ERROR };

export function readApiBackendKey(
	backend: ActiveApiProviderBackend,
): ApiBackendKeyMaterial {
	const credentialPolicy = getProviderCredentialPolicy(backend.provider);
	if (!backend.encryptedApiKey) {
		return { ok: true, apiKey: "" };
	}

	const decryptResult = decryptStoredApiKey(backend.encryptedApiKey);
	if (!decryptResult.ok) {
		if (!credentialPolicy.requiresApiKey) {
			return { ok: true, apiKey: "" };
		}
		return { ok: false, error: UNREADABLE_API_KEY_ERROR };
	}

	return { ok: true, apiKey: decryptResult.apiKey };
}

export function assertApiBackendDeployable(backend: ActiveApiProviderBackend) {
	const credentialPolicy = getProviderCredentialPolicy(backend.provider);
	const keyMaterial = readApiBackendKey(backend);

	if (!keyMaterial.ok) {
		return keyMaterial;
	}

	if (credentialPolicy.requiresApiKey && !keyMaterial.apiKey) {
		return { ok: false as const, error: "API key is required." };
	}

	const hermesProviderId =
		PROVIDER_ENV_CONFIGS[backend.provider]?.hermesProvider ?? "";
	if (!hermesProviderId) {
		return { ok: false as const, error: "Unsupported provider deploy target." };
	}

	return {
		ok: true as const,
		apiKey: keyMaterial.apiKey,
		hermesProviderId,
		model: backend.model,
		deployLabel: resolveDeployProviderLabel(backend),
	};
}

export function resolveSubscriptionDeployTarget(backend: ActiveModelBackend) {
	if (backend.kind !== "subscription") {
		throw new Error("Expected subscription backend.");
	}

	return {
		hermesProviderId: backend.hermesProviderId,
		model: backend.model,
		deployLabel: resolveDeployProviderLabel(backend),
	};
}

export function readApiBackendKeyForEnvMap(backend: ActiveApiProviderBackend) {
	const credentialPolicy = getProviderCredentialPolicy(backend.provider);
	const keyMaterial = readApiBackendKey(backend);

	if (!keyMaterial.ok) {
		throw new Error(keyMaterial.error);
	}

	if (credentialPolicy.requiresApiKey && !keyMaterial.apiKey) {
		throw new Error(`API key is required for provider ${backend.provider}.`);
	}

	return {
		apiKey: keyMaterial.apiKey,
	};
}
