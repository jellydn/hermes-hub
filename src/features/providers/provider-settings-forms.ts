import * as z from "zod";
import {
	type ApiProviderId,
	getAiProviderOption,
	getDefaultAiModel,
} from "#/lib/ai-providers";
import {
	getDefaultSubscriptionModel,
	getSubscriptionDefaultBaseUrl,
	type UserSubscriptionId,
} from "#/lib/user-subscriptions";
import type {
	ApiProviderConfigSummary,
	UserSubscriptionConfigSummary,
} from "#shared/contracts/model-access";

export type ProviderFormState = {
	provider: ApiProviderId;
	model: string;
	apiKey: string;
	baseUrl: string;
};

export type SubscriptionFormState = {
	subscriptionProvider: UserSubscriptionId;
	model: string;
	apiKey: string;
	baseUrl: string;
};

const initialProvider = "openai" as ApiProviderId;

export const providerSchema = z.object({
	provider: z.enum([
		"openai",
		"anthropic",
		"openrouter",
		"ollama",
		"deepseek",
		"commandcode",
		"custom",
	]),
	model: z.string(),
	apiKey: z.string(),
	baseUrl: z.string(),
});

export const subscriptionSchema = z.object({
	subscriptionProvider: z.enum(["chatgpt", "mimo"]),
	model: z.string(),
	apiKey: z.string(),
	baseUrl: z.string(),
});

export function createInitialProviderFormState(
	initialConfig: ApiProviderConfigSummary | null | undefined,
): ProviderFormState {
	const provider = initialConfig?.provider ?? initialProvider;
	const option = getAiProviderOption(provider);

	return {
		provider,
		model: initialConfig?.model ?? getDefaultAiModel(provider),
		apiKey: "",
		baseUrl: initialConfig?.baseUrl ?? option?.defaultBaseUrl ?? "",
	};
}

export function createInitialSubscriptionFormState(
	initialSubscription: UserSubscriptionConfigSummary | null | undefined,
): SubscriptionFormState {
	const subscriptionProvider =
		initialSubscription?.subscriptionProvider ?? "chatgpt";

	return {
		subscriptionProvider,
		model:
			initialSubscription?.model ??
			getDefaultSubscriptionModel(subscriptionProvider),
		apiKey: "",
		baseUrl:
			initialSubscription?.baseUrl ??
			getSubscriptionDefaultBaseUrl(subscriptionProvider),
	};
}
