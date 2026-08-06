export type UserSubscriptionId = "chatgpt" | "mimo" | "commandcode";

export const FUTURE_USER_SUBSCRIPTION_IDS = ["github-copilot"] as const;
export type FutureUserSubscriptionId =
	(typeof FUTURE_USER_SUBSCRIPTION_IDS)[number];

export const LEGACY_CODEX_PROVIDER_ID = "openai-codex" as const;

export type SubscriptionDeployEnvConfig = {
	apiKeyEnvVar: string;
	baseUrlEnvVar: string;
};

type BaseSubscriptionOption = {
	id: UserSubscriptionId;
	label: string;
	description: string;
	models: readonly string[];
	defaultModel: string;
	authMode: string;
	hermesProviderId: string;
	supportsConnectionTest: boolean;
};

export type OAuthSubscriptionOption = BaseSubscriptionOption & {
	credentialKind: "oauth";
};

export type CredentialSubscriptionOption = BaseSubscriptionOption & {
	credentialKind: "api-key";
	storageProviderId: string;
	defaultBaseUrl: string;
	deployEnv: SubscriptionDeployEnvConfig;
};

export type UserSubscriptionOption =
	| OAuthSubscriptionOption
	| CredentialSubscriptionOption;

export const userSubscriptionOptions: readonly UserSubscriptionOption[] = [
	{
		id: "chatgpt",
		label: "ChatGPT",
		description:
			"Use ChatGPT subscription models via Codex OAuth on your deployed Hermes server.",
		hermesProviderId: LEGACY_CODEX_PROVIDER_ID,
		authMode: "chatgpt",
		credentialKind: "oauth",
		supportsConnectionTest: false,
		models: [
			"gpt-5.5",
			"gpt-5.4-mini",
			"gpt-5.4",
			"gpt-5.3-codex",
			"gpt-5.3-codex-spark",
		],
		defaultModel: "gpt-5.5",
	},
	{
		id: "mimo",
		label: "Xiaomi MiMo Token Plan",
		description:
			"Use MiMo Token Plan with a tp-* API key and the exclusive MiMo base URL.",
		hermesProviderId: "xiaomi",
		authMode: "mimo-token-plan",
		credentialKind: "api-key",
		supportsConnectionTest: true,
		storageProviderId: "mimo",
		defaultBaseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
		deployEnv: {
			apiKeyEnvVar: "XIAOMI_API_KEY",
			baseUrlEnvVar: "XIAOMI_BASE_URL",
		},
		models: ["mimo-v2.5-pro", "mimo-v2.5"],
		defaultModel: "mimo-v2.5-pro",
	},
	{
		id: "commandcode",
		label: "Command Code Coding Plan",
		description:
			"Use your Command Code subscription (Go $1/mo, Pro $15/mo) with a user_* API key. Access DeepSeek, MiMo, MiniMax, and more.",
		hermesProviderId: "custom",
		authMode: "coding-plan",
		credentialKind: "api-key",
		supportsConnectionTest: true,
		storageProviderId: "commandcode",
		defaultBaseUrl: "https://api.commandcode.ai/provider/v1",
		deployEnv: {
			apiKeyEnvVar: "COMMANDCODE_API_KEY",
			baseUrlEnvVar: "COMMANDCODE_BASE_URL",
		},
		models: [
			"taste-1",
			"deepseek/deepseek-v4-flash",
			"deepseek/deepseek-v4-pro",
			"minimax/minimax-m3",
			"mimo/mimo-v2.5-pro",
			"mimo/mimo-v2.5",
		],
		defaultModel: "deepseek/deepseek-v4-flash",
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

export function getCredentialSubscriptionOption(
	subscription: UserSubscriptionId,
): CredentialSubscriptionOption | null {
	const option = getUserSubscriptionOption(subscription);
	return option?.credentialKind === "api-key" ? option : null;
}

export function getSubscriptionByStorageProviderId(
	storageProviderId: string,
): CredentialSubscriptionOption | null {
	return (
		userSubscriptionOptions.find(
			(option): option is CredentialSubscriptionOption =>
				option.credentialKind === "api-key" &&
				option.storageProviderId === storageProviderId,
		) ?? null
	);
}

export function isSubscriptionStorageProviderId(value: string) {
	return getSubscriptionByStorageProviderId(value) !== null;
}

export function getDefaultSubscriptionModel(subscription: UserSubscriptionId) {
	return getUserSubscriptionOption(subscription)?.defaultModel ?? "";
}

export function getSubscriptionDefaultBaseUrl(
	subscription: UserSubscriptionId,
) {
	return getCredentialSubscriptionOption(subscription)?.defaultBaseUrl ?? "";
}

export function getSubscriptionStorageProviderId(
	subscription: UserSubscriptionId,
) {
	return (
		getCredentialSubscriptionOption(subscription)?.storageProviderId ?? null
	);
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

export function subscriptionSupportsConnectionTest(
	subscription: UserSubscriptionId,
) {
	return (
		getUserSubscriptionOption(subscription)?.supportsConnectionTest ?? false
	);
}
