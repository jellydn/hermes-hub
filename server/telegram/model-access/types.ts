import type {
	ModelAccessOption,
	ModelAccessOptionsResponse,
} from "#shared/contracts/telegram-model-access";

// ── Row types ────────────────────────────────────────────────────

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

// ── Resolution types ─────────────────────────────────────────────

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

export type ActiveOptionIds = {
	providerIds: string[];
	subscriptionIds: string[];
};

// Re-export contract type for convenience
export type { ModelAccessOption, ModelAccessOptionsResponse };
