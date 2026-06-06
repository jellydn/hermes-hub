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
	| { type: "deploy_finished" };

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
