import type { ApiProviderId } from "#/lib/ai-providers";
import type { UserSubscriptionId } from "#/lib/user-subscriptions";

export type ApiProviderConfigSummary = {
	kind: "api-provider";
	provider: ApiProviderId;
	model: string;
	keyLast4: string | null;
	hasStoredKey: boolean;
	baseUrl?: string;
};

export type UserSubscriptionConfigSummary = {
	kind: "subscription";
	subscriptionProvider: UserSubscriptionId;
	model: string;
	authMode: string;
	keyLast4?: string | null;
	hasStoredKey?: boolean;
	baseUrl?: string;
};

export type ModelAccessSnapshot = {
	apiProvider: ApiProviderConfigSummary | null;
	subscription: UserSubscriptionConfigSummary | null;
	activeBackend: "api-provider" | "subscription" | null;
};
