export type UserSubscriptionId = "chatgpt";

export const FUTURE_USER_SUBSCRIPTION_IDS = ["github-copilot"] as const;
export type FutureUserSubscriptionId =
	(typeof FUTURE_USER_SUBSCRIPTION_IDS)[number];

export const LEGACY_CODEX_PROVIDER_ID = "openai-codex" as const;

export type UserSubscriptionOption = {
	id: UserSubscriptionId;
	label: string;
	description: string;
	hermesProviderId: typeof LEGACY_CODEX_PROVIDER_ID;
	authMode: string;
	models: readonly string[];
	defaultModel: string;
};

export const userSubscriptionOptions: readonly UserSubscriptionOption[] = [
	{
		id: "chatgpt",
		label: "ChatGPT",
		description:
			"Use ChatGPT subscription models via Codex OAuth on your deployed Hermes server.",
		hermesProviderId: LEGACY_CODEX_PROVIDER_ID,
		authMode: "chatgpt",
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

export function isUserSubscriptionId(
	value: string,
): value is UserSubscriptionId {
	return userSubscriptionOptions.some((option) => option.id === value);
}

export function isLegacyCodexProviderId(
	value: string,
): value is typeof LEGACY_CODEX_PROVIDER_ID {
	return value === LEGACY_CODEX_PROVIDER_ID;
}

export function getUserSubscriptionOption(subscription: UserSubscriptionId) {
	return (
		userSubscriptionOptions.find((option) => option.id === subscription) ?? null
	);
}

export function getDefaultSubscriptionModel(subscription: UserSubscriptionId) {
	return getUserSubscriptionOption(subscription)?.defaultModel ?? "";
}

export function formatUserSubscriptionLabel(subscription: UserSubscriptionId) {
	return getUserSubscriptionOption(subscription)?.label ?? subscription;
}

export function getSubscriptionHermesProviderId(
	subscription: UserSubscriptionId,
) {
	return (
		getUserSubscriptionOption(subscription)?.hermesProviderId ??
		LEGACY_CODEX_PROVIDER_ID
	);
}

export function isValidSubscriptionModel(
	subscription: UserSubscriptionId,
	model: string,
) {
	const option = getUserSubscriptionOption(subscription);
	if (!option || !model) {
		return false;
	}

	return option.models.includes(model);
}
