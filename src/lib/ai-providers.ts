export type AiProviderId =
	| "openai"
	| "anthropic"
	| "openrouter"
	| "ollama"
	| "custom"
	| "openai-codex";

export type AiProviderCredentialMode = "api-key" | "oauth-device-code";

export type ProviderCredentialPolicy = {
	kind: AiProviderCredentialMode;
	requiresApiKey: boolean;
	requiresBaseUrl: boolean;
	requiresRemoteOAuth: boolean;
	reportsStoredKeyWithoutApiKey: boolean;
};

type AiProviderOption = {
	id: AiProviderId;
	label: string;
	description: string;
	models: readonly string[];
	defaultModel: string;
	credentialMode?: AiProviderCredentialMode;
	requiresCustomModel?: boolean;
	requiresBaseUrl?: boolean;
	defaultBaseUrl?: string;
};

export const aiProviderOptions: readonly AiProviderOption[] = [
	{
		id: "openai",
		label: "OpenAI",
		description:
			"Best-fit defaults for Hermes agents running on OpenAI models.",
		models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
		defaultModel: "gpt-4o-mini",
	},
	{
		id: "anthropic",
		label: "Anthropic",
		description:
			"Claude models tuned for long-form, tool-friendly conversations.",
		models: ["claude-sonnet-4-20250514", "claude-haiku-3-5"],
		defaultModel: "claude-sonnet-4-20250514",
	},
	{
		id: "openrouter",
		label: "OpenRouter",
		description:
			"Bring your own routed model ID when you need a custom catalog.",
		models: [],
		defaultModel: "openai/gpt-4o-mini",
		requiresCustomModel: true,
	},
	{
		id: "ollama",
		label: "Ollama / Local",
		description:
			"Run open-weight models locally or via a private Ollama cluster.",
		models: [],
		defaultModel: "llama3",
		requiresCustomModel: true,
		requiresBaseUrl: true,
		defaultBaseUrl: "http://localhost:11434/v1",
	},
	{
		id: "custom",
		label: "Custom / BYO",
		description:
			"Connect to any OpenAI-compatible API endpoint (e.g. OllamaCloud, DeepSeek, Together, etc.).",
		models: [],
		defaultModel: "",
		requiresCustomModel: true,
		requiresBaseUrl: true,
	},
	{
		id: "openai-codex",
		label: "OpenAI Codex / ChatGPT",
		description:
			"Use ChatGPT subscription models via Codex OAuth on your deployed Hermes server.",
		credentialMode: "oauth-device-code",
		models: [
			"gpt-5.5",
			"gpt-5.4-mini",
			"gpt-5.4",
			"gpt-5.3-codex",
			"gpt-5.3-codex-spark",
		],
		defaultModel: "gpt-5.5",
	},
] as const;

export function isAiProviderId(value: string): value is AiProviderId {
	return aiProviderOptions.some((option) => option.id === value);
}

export function getAiProviderOption(provider: AiProviderId) {
	return aiProviderOptions.find((option) => option.id === provider) ?? null;
}

export function getDefaultAiModel(provider: AiProviderId) {
	return getAiProviderOption(provider)?.defaultModel ?? "";
}

/**
 * Regex for validating custom model identifiers.
 *
 * Accepted characters: alphanumeric, dots, underscores, colons, forward
 * slashes, and hyphens. Length must be between 1 and 120 characters.
 * This covers all known production model IDs (OpenAI, Anthropic,
 * OpenRouter, Ollama, etc.) while rejecting inputs that could carry
 * shell metacharacters or break YAML/JSON structure.
 */
export const MODEL_VALIDATION_REGEX = /^[A-Za-z0-9._:/-]{1,120}$/;

export function isValidModelString(model: string): boolean {
	return MODEL_VALIDATION_REGEX.test(model);
}

export function isValidAiModel(provider: AiProviderId, model: string) {
	const option = getAiProviderOption(provider);
	if (!option) {
		return false;
	}

	if (!model) {
		return false;
	}

	if (!isValidModelString(model)) {
		return false;
	}

	if (option.requiresCustomModel) {
		return true;
	}

	return option.models.includes(model);
}

export function formatAiProviderLabel(provider: AiProviderId) {
	return getAiProviderOption(provider)?.label ?? provider;
}

export function getProviderCredentialPolicy(
	provider: AiProviderId,
): ProviderCredentialPolicy {
	const option = getAiProviderOption(provider);
	const kind = option?.credentialMode ?? "api-key";
	const requiresRemoteOAuth = kind === "oauth-device-code";
	const requiresBaseUrl = Boolean(option?.requiresBaseUrl);
	const requiresApiKey = !requiresRemoteOAuth && !requiresBaseUrl;

	return {
		kind,
		requiresApiKey,
		requiresBaseUrl,
		requiresRemoteOAuth,
		reportsStoredKeyWithoutApiKey: requiresRemoteOAuth,
	};
}

export function getAiProviderCredentialMode(
	provider: AiProviderId,
): AiProviderCredentialMode {
	return getProviderCredentialPolicy(provider).kind;
}

export function usesOAuthDeviceCode(provider: AiProviderId): boolean {
	return getProviderCredentialPolicy(provider).requiresRemoteOAuth;
}

export function providerRequiresApiKey(provider: AiProviderId): boolean {
	return getProviderCredentialPolicy(provider).requiresApiKey;
}
