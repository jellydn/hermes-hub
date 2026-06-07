import {
	type ApiProviderId,
	providerRequiresApiKey,
} from "../../src/lib/ai-providers";

export type ProviderRequest = {
	provider: string;
	model?: string;
	apiKey?: string;
	baseUrl?: string;
};

export type SubscriptionRequest = {
	subscriptionProvider: string;
	model?: string;
};

export type StoredProviderRecord = {
	provider: string;
	model: string;
	encryptedApiKey: string;
	baseUrl: string | null;
	isActive?: boolean;
};

type ProviderEnvConfig = {
	apiKeyEnvVar?: string;
	baseUrlEnvVar?: string;
	hermesProvider: string;
	extraBaseUrlEnvVars?: string[];
};

export const PROVIDER_ENV_CONFIGS: Record<ApiProviderId, ProviderEnvConfig> = {
	openai: { apiKeyEnvVar: "OPENAI_API_KEY", hermesProvider: "openai-api" },
	anthropic: { apiKeyEnvVar: "ANTHROPIC_API_KEY", hermesProvider: "anthropic" },
	openrouter: {
		apiKeyEnvVar: "OPENROUTER_API_KEY",
		hermesProvider: "openrouter",
	},
	ollama: {
		baseUrlEnvVar: "CUSTOM_BASE_URL",
		extraBaseUrlEnvVars: ["OPENAI_BASE_URL"],
		hermesProvider: "custom",
	},
	custom: {
		apiKeyEnvVar: "OPENAI_API_KEY",
		baseUrlEnvVar: "CUSTOM_BASE_URL",
		extraBaseUrlEnvVars: ["OPENAI_BASE_URL"],
		hermesProvider: "custom",
	},
};

export function buildProviderEnvMap(
	provider: ApiProviderId,
	apiKey: string,
	baseUrl: string | null | undefined,
): Record<string, string> {
	const config = PROVIDER_ENV_CONFIGS[provider];
	if (!config) {
		return {};
	}

	const envVars: Record<string, string> = {};

	envVars.HERMES_INFERENCE_PROVIDER = config.hermesProvider;

	if (config.apiKeyEnvVar && apiKey) {
		envVars[config.apiKeyEnvVar] = apiKey;
	}

	const customApiKeyEnvVar = deriveCustomProviderApiKeyEnvVar(baseUrl);
	if (customApiKeyEnvVar && apiKey) {
		envVars[customApiKeyEnvVar] = apiKey;
	}

	if (config.baseUrlEnvVar && baseUrl) {
		envVars[config.baseUrlEnvVar] = baseUrl;
		for (const extraEnvVar of config.extraBaseUrlEnvVars ?? []) {
			envVars[extraEnvVar] = baseUrl;
		}
	}

	return envVars;
}

export function buildSubscriptionEnvMap(hermesProviderId: string) {
	return {
		HERMES_INFERENCE_PROVIDER: hermesProviderId,
	};
}

export function isApiKeyRequired(provider: ApiProviderId): boolean {
	return providerRequiresApiKey(provider);
}

function deriveCustomProviderApiKeyEnvVar(baseUrl: string | null | undefined) {
	if (!baseUrl) {
		return null;
	}

	let hostname: string;
	try {
		hostname = new URL(baseUrl).hostname.toLowerCase();
	} catch {
		return null;
	}

	if (!hostname || hostname === "localhost" || hostname.includes(":")) {
		return null;
	}

	const labels: string[] = [];
	for (const part of hostname.split(".")) {
		const label = part.trim();
		if (label) {
			labels.push(label);
		}
	}
	while (labels[0] === "api" || labels[0] === "www") {
		labels.shift();
	}

	if (labels.length < 2 || /^\d/.test(labels.at(-1) ?? "")) {
		return null;
	}

	const vendor = labels.at(-2) ?? "";
	const sanitized = vendor
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "_")
		.replace(/_+/g, "_");
	if (!/^[A-Z]/.test(sanitized)) {
		return null;
	}

	if (
		sanitized === "OPENAI" ||
		sanitized === "OPENROUTER" ||
		sanitized === "OLLAMA"
	) {
		return null;
	}

	return `${sanitized}_API_KEY`;
}
