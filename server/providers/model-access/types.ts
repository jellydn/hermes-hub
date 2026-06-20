// ── Types ────────────────────────────────────────────────────────────

import type { ModelAccessSnapshot } from "../../../shared/contracts/model-access";
import type { ApiProviderId } from "../../../src/lib/ai-providers";
import type { UserSubscriptionId } from "../../../src/lib/user-subscriptions";

export type ActiveApiProviderBackend = {
	kind: "api-provider";
	provider: ApiProviderId;
	model: string;
	encryptedApiKey: string;
	baseUrl: string | null;
};

export type ActiveOAuthSubscriptionBackend = {
	kind: "subscription";
	access: "oauth";
	subscriptionProvider: UserSubscriptionId;
	model: string;
	authMode: string;
	hermesProviderId: string;
};

export type ActiveCredentialSubscriptionBackend = {
	kind: "subscription";
	access: "credential";
	subscriptionProvider: UserSubscriptionId;
	model: string;
	authMode: string;
	hermesProviderId: string;
	storageProviderId: string;
	encryptedApiKey: string;
	baseUrl: string | null;
};

export type ActiveSubscriptionBackend =
	| ActiveOAuthSubscriptionBackend
	| ActiveCredentialSubscriptionBackend;

export type ActiveModelBackend =
	| ActiveApiProviderBackend
	| ActiveSubscriptionBackend;

export type StoredProviderRecordInput = {
	provider: string;
	model: string;
	encryptedApiKey: string;
	baseUrl: string | null;
	isActive?: boolean;
};

export type ActiveOptionIds = {
	providerIds: string[];
	subscriptionIds: string[];
};

export type ResolvedOption =
	| {
			ok: true;
			kind: "api-provider" | "credential-subscription" | "oauth-subscription";
			provider: string;
			hermesProviderId: string;
			model: string;
			allowsCustomModel: boolean;
			fixedModels: string[];
			activeOptionIds: ActiveOptionIds;
	  }
	| { ok: false; error: string };

export type ActiveAccessSummary = {
	apiProvider: ModelAccessSnapshot["apiProvider"];
	subscription: ModelAccessSnapshot["subscription"];
};

export type AiProviderRow = {
	id: string;
	provider: string;
	model: string;
	encryptedApiKey: string;
	baseUrl: string | null;
	isActive: boolean;
};

export type AiUserSubscriptionRow = {
	id: string;
	subscriptionProvider: string;
	model: string;
	authMode: string;
	isActive: boolean;
};

export type ProviderRecordForOption = Pick<
	AiProviderRow,
	"id" | "provider" | "model" | "encryptedApiKey" | "baseUrl"
>;
