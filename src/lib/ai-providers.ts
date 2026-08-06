export type ApiProviderId =
	| "openai"
	| "anthropic"
	| "openrouter"
	| "ollama"
	| "deepseek"
	| "commandcode"
	| "custom";

/** @deprecated Use ApiProviderId for API-key providers. */
export type AiProviderId = ApiProviderId;

export type AiProviderCredentialMode = "api-key";

export type ProviderCredentialPolicy = {
	kind: AiProviderCredentialMode;
	requiresApiKey: boolean;
	requiresBaseUrl: boolean;
	requiresRemoteOAuth: false;
	reportsStoredKeyWithoutApiKey: false;
};

type AiProviderOption = {
	id: ApiProviderId;
	label: string;
	description: string;
	models: readonly string[];
	defaultModel: string;
	requiresCustomModel?: boolean;
	requiresApiKey?: boolean;
	requiresBaseUrl?: boolean;
	defaultBaseUrl?: string;
};

export const apiProviderOptions: readonly AiProviderOption[] = [
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
		id: "deepseek",
		label: "DeepSeek",
		description:
			"Cost-effective reasoning and chat models via the DeepSeek OpenAI-compatible API.",
		models: ["deepseek-v4-flash", "deepseek-v4-pro"],
		defaultModel: "deepseek-v4-flash",
		requiresApiKey: true,
		requiresBaseUrl: true,
		defaultBaseUrl: "https://api.deepseek.com/v1",
	},
	{
		id: "commandcode",
		label: "Command Code",
		description:
			"Every top model via the Command Code Provider API (OpenAI-compatible). Coding plans from $1/mo.",
		models: [],
		defaultModel: "deepseek/deepseek-v4-flash",
		requiresCustomModel: true,
		requiresApiKey: true,
		requiresBaseUrl: true,
		defaultBaseUrl: "https://api.commandcode.ai/provider/v1",
	},
	{
		id: "custom",
		label: "Custom / BYO",
		description:
			"Connect to any OpenAI-compatible API endpoint (e.g. OllamaCloud, Together, etc.).",
		models: [],
		defaultModel: "",
		requiresCustomModel: true,
		requiresBaseUrl: true,
	},
] as const;

/** API provider grid options. */
export const aiProviderOptions = apiProviderOptions;

export function isApiProviderId(value: string): value is ApiProviderId {
	return apiProviderOptions.some((option) => option.id === value);
}

export function isAiProviderId(value: string): value is ApiProviderId {
	return isApiProviderId(value);
}

export function getAiProviderOption(provider: ApiProviderId) {
	return apiProviderOptions.find((option) => option.id === provider) ?? null;
}

export function getDefaultAiModel(provider: ApiProviderId) {
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

export function isValidAiModel(provider: ApiProviderId, model: string) {
	const option = getAiProviderOption(provider);
	if (!option) {
		return false;
	}

	if (!model) {
		return false;
	}

	// All providers accept custom model IDs. The fixed `models` list is a set
	// of quick-pick suggestions, not a strict allowlist — users can type any
	// valid model string (e.g. a newly released model not yet in the list).
	return isValidModelString(model);
}

export function formatAiProviderLabel(provider: ApiProviderId) {
	return getAiProviderOption(provider)?.label ?? provider;
}

export function getProviderCredentialPolicy(
	provider: ApiProviderId,
): ProviderCredentialPolicy {
	const option = getAiProviderOption(provider);
	const requiresBaseUrl = Boolean(option?.requiresBaseUrl);
	const requiresApiKey = option?.requiresApiKey ?? !requiresBaseUrl;

	return {
		kind: "api-key",
		requiresApiKey,
		requiresBaseUrl,
		requiresRemoteOAuth: false,
		reportsStoredKeyWithoutApiKey: false,
	};
}

export function getAiProviderCredentialMode(
	provider: ApiProviderId,
): AiProviderCredentialMode {
	return getProviderCredentialPolicy(provider).kind;
}

export function usesOAuthDeviceCode(_provider: ApiProviderId): boolean {
	return false;
}

export function providerRequiresApiKey(provider: ApiProviderId): boolean {
	return getProviderCredentialPolicy(provider).requiresApiKey;
}
