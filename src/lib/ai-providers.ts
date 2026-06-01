export type AiProviderId =
	| "openai"
	| "anthropic"
	| "openrouter"
	| "ollama"
	| "custom";

type AiProviderOption = {
	id: AiProviderId;
	label: string;
	description: string;
	models: readonly string[];
	defaultModel: string;
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
