import type { CodexAuthStatus } from "#shared/contracts/codex-auth";
import type {
	ApiProviderConfigSummary,
	ModelAccessSnapshot,
	UserSubscriptionConfigSummary,
} from "#shared/contracts/model-access";

export type ProviderSettingsUiState = {
	savedApiConfig: ApiProviderConfigSummary | null;
	savedSubscription: UserSubscriptionConfigSummary | null;
	activeBackend: ModelAccessSnapshot["activeBackend"];
	isSavingProvider: boolean;
	isSavingSubscription: boolean;
	isTesting: boolean;
	providerSaveMessage: string | null;
	subscriptionSaveMessage: string | null;
	providerSaveError: string | null;
	subscriptionSaveError: string | null;
	testError: string | null;
	isConnected: boolean;
	isDeploying: boolean;
	deployError: string | null;
	deployResult: string | null;
	codexAuthStatus: CodexAuthStatus | null;
	isLoadingCodexAuth: boolean;
	codexAuthError: string | null;
};

export type ProviderSettingsUiAction =
	| { type: "provider_changed" }
	| { type: "provider_save_started" }
	| { type: "provider_save_failed"; error: string }
	| { type: "provider_save_succeeded"; config: ApiProviderConfigSummary }
	| { type: "provider_save_finished" }
	| { type: "subscription_save_started" }
	| { type: "subscription_save_failed"; error: string }
	| {
			type: "subscription_save_succeeded";
			config: UserSubscriptionConfigSummary;
	  }
	| { type: "subscription_save_finished" }
	| { type: "test_started" }
	| { type: "test_failed"; error: string }
	| { type: "test_succeeded"; connected: boolean }
	| { type: "test_finished" }
	| { type: "deploy_started" }
	| { type: "deploy_failed"; error: string }
	| { type: "deploy_succeeded"; message: string }
	| { type: "deploy_finished" }
	| { type: "codex_auth_status_load_started" }
	| {
			type: "codex_auth_status_changed";
			status: CodexAuthStatus | null;
			isLoading: boolean;
			error: string | null;
	  };

export function createInitialProviderSettingsUiState(
	initialAccess: ModelAccessSnapshot | null,
): ProviderSettingsUiState {
	return {
		savedApiConfig: initialAccess?.apiProvider ?? null,
		savedSubscription: initialAccess?.subscription ?? null,
		activeBackend: initialAccess?.activeBackend ?? null,
		isSavingProvider: false,
		isSavingSubscription: false,
		isTesting: false,
		providerSaveMessage: null,
		subscriptionSaveMessage: null,
		providerSaveError: null,
		subscriptionSaveError: null,
		testError: null,
		isConnected: false,
		isDeploying: false,
		deployError: null,
		deployResult: null,
		codexAuthStatus: null,
		isLoadingCodexAuth: false,
		codexAuthError: null,
	};
}

export function providerSettingsUiReducer(
	state: ProviderSettingsUiState,
	action: ProviderSettingsUiAction,
): ProviderSettingsUiState {
	switch (action.type) {
		case "provider_changed":
			return {
				...state,
				providerSaveMessage: null,
				providerSaveError: null,
				testError: null,
				isConnected: false,
			};
		case "codex_auth_status_load_started":
			return {
				...state,
				isLoadingCodexAuth: true,
				codexAuthError: null,
			};
		case "codex_auth_status_changed":
			return {
				...state,
				codexAuthStatus: action.status,
				isLoadingCodexAuth: action.isLoading,
				codexAuthError: action.error,
			};
		case "provider_save_started":
			return {
				...state,
				isSavingProvider: true,
				providerSaveMessage: null,
				providerSaveError: null,
				testError: null,
			};
		case "provider_save_failed":
			return {
				...state,
				providerSaveError: action.error,
			};
		case "provider_save_succeeded":
			return {
				...state,
				savedApiConfig: action.config,
				activeBackend: "api-provider",
				providerSaveMessage: "API provider settings saved.",
			};
		case "provider_save_finished":
			return {
				...state,
				isSavingProvider: false,
			};
		case "subscription_save_started":
			return {
				...state,
				isSavingSubscription: true,
				subscriptionSaveMessage: null,
				subscriptionSaveError: null,
			};
		case "subscription_save_failed":
			return {
				...state,
				subscriptionSaveError: action.error,
			};
		case "subscription_save_succeeded":
			return {
				...state,
				savedSubscription: action.config,
				activeBackend: "subscription",
				subscriptionSaveMessage: "Subscription settings saved.",
			};
		case "subscription_save_finished":
			return {
				...state,
				isSavingSubscription: false,
			};
		case "test_started":
			return {
				...state,
				isTesting: true,
				testError: null,
				providerSaveError: null,
				isConnected: false,
			};
		case "test_failed":
			return {
				...state,
				testError: action.error,
			};
		case "test_succeeded":
			return {
				...state,
				isConnected: action.connected,
			};
		case "test_finished":
			return {
				...state,
				isTesting: false,
			};
		case "deploy_started":
			return {
				...state,
				isDeploying: true,
				deployError: null,
				deployResult: null,
			};
		case "deploy_failed":
			return {
				...state,
				deployError: action.error,
			};
		case "deploy_succeeded":
			return {
				...state,
				deployResult: action.message,
			};
		case "deploy_finished":
			return {
				...state,
				isDeploying: false,
			};
		default:
			return state;
	}
}
