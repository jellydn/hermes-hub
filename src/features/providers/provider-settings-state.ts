import type { CodexAuthStatus } from "../../../shared/contracts/codex-auth";

import type { ProviderSettingsSummary } from "./provider-settings";

export type ProviderSettingsUiState = {
	savedConfig: ProviderSettingsSummary | null;
	isSaving: boolean;
	isTesting: boolean;
	saveMessage: string | null;
	saveError: string | null;
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
	| { type: "save_started" }
	| { type: "save_failed"; error: string }
	| { type: "save_succeeded"; config: ProviderSettingsSummary }
	| { type: "save_finished" }
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
	initialConfig: ProviderSettingsSummary | null,
): ProviderSettingsUiState {
	return {
		savedConfig: initialConfig,
		isSaving: false,
		isTesting: false,
		saveMessage: null,
		saveError: null,
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
				saveMessage: null,
				saveError: null,
				testError: null,
				isConnected: false,
				codexAuthStatus: null,
				isLoadingCodexAuth: false,
				codexAuthError: null,
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
		case "save_started":
			return {
				...state,
				isSaving: true,
				saveMessage: null,
				saveError: null,
				testError: null,
			};
		case "save_failed":
			return {
				...state,
				saveError: action.error,
			};
		case "save_succeeded":
			return {
				...state,
				savedConfig: action.config,
				saveMessage: "Provider settings saved.",
			};
		case "save_finished":
			return {
				...state,
				isSaving: false,
			};
		case "test_started":
			return {
				...state,
				isTesting: true,
				testError: null,
				saveError: null,
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
