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
	isTestingApiProvider: boolean;
	isTestingSubscription: boolean;
	providerSaveMessage: string | null;
	subscriptionSaveMessage: string | null;
	providerSaveError: string | null;
	subscriptionSaveError: string | null;
	apiTestError: string | null;
	subscriptionTestError: string | null;
	verifiedApiConnectionFingerprint: string | null;
	verifiedSubscriptionConnectionFingerprint: string | null;
	codexAuthStatus: CodexAuthStatus | null;
	isLoadingCodexAuth: boolean;
	codexAuthError: string | null;
};

export type ProviderSettingsUiAction =
	| { type: "provider_changed" }
	| { type: "subscription_changed" }
	| { type: "provider_save_started" }
	| { type: "provider_save_failed"; error: string }
	| { type: "provider_save_succeeded"; config: ApiProviderConfigSummary }
	| { type: "provider_save_finished" }
	| { type: "subscription_save_started" }
	| { type: "subscription_save_failed"; error: string }
	| {
			type: "subscription_save_succeeded";
			config: UserSubscriptionConfigSummary;
			connectionFingerprint?: string | null;
	  }
	| { type: "subscription_save_finished" }
	| { type: "api_test_started" }
	| { type: "api_test_failed"; error: string }
	| { type: "api_test_succeeded"; fingerprint: string }
	| { type: "api_test_finished" }
	| { type: "subscription_test_started" }
	| { type: "subscription_test_failed"; error: string }
	| { type: "subscription_test_succeeded"; fingerprint: string }
	| { type: "subscription_test_finished" }
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
		isTestingApiProvider: false,
		isTestingSubscription: false,
		providerSaveMessage: null,
		subscriptionSaveMessage: null,
		providerSaveError: null,
		subscriptionSaveError: null,
		apiTestError: null,
		subscriptionTestError: null,
		verifiedApiConnectionFingerprint: null,
		verifiedSubscriptionConnectionFingerprint: null,
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
				apiTestError: null,
				verifiedApiConnectionFingerprint: null,
			};
		case "subscription_changed":
			return {
				...state,
				subscriptionSaveMessage: null,
				subscriptionSaveError: null,
				subscriptionTestError: null,
				verifiedSubscriptionConnectionFingerprint: null,
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
				apiTestError: null,
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
				verifiedApiConnectionFingerprint: null,
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
				subscriptionTestError: null,
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
				verifiedSubscriptionConnectionFingerprint:
					action.connectionFingerprint ??
					state.verifiedSubscriptionConnectionFingerprint,
			};
		case "subscription_save_finished":
			return {
				...state,
				isSavingSubscription: false,
			};
		case "api_test_started":
			return {
				...state,
				isTestingApiProvider: true,
				apiTestError: null,
				providerSaveError: null,
				verifiedApiConnectionFingerprint: null,
			};
		case "api_test_failed":
			return {
				...state,
				apiTestError: action.error,
			};
		case "api_test_succeeded":
			return {
				...state,
				verifiedApiConnectionFingerprint: action.fingerprint,
			};
		case "api_test_finished":
			return {
				...state,
				isTestingApiProvider: false,
			};
		case "subscription_test_started":
			return {
				...state,
				isTestingSubscription: true,
				subscriptionTestError: null,
				subscriptionSaveError: null,
				verifiedSubscriptionConnectionFingerprint: null,
			};
		case "subscription_test_failed":
			return {
				...state,
				subscriptionTestError: action.error,
			};
		case "subscription_test_succeeded":
			return {
				...state,
				verifiedSubscriptionConnectionFingerprint: action.fingerprint,
			};
		case "subscription_test_finished":
			return {
				...state,
				isTestingSubscription: false,
			};
		default:
			return state;
	}
}
