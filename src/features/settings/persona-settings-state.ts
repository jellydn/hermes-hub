import type { PersonaSettingsSummary } from "./persona-settings";

export type PersonaSettingsUiState = {
	savedSettings: PersonaSettingsSummary | null;
	isSaving: boolean;
	saveError: string | null;
	saveSuccess: string | null;
	isDeploying: boolean;
	deployError: string | null;
	deployResult: string | null;
};

export type PersonaSettingsUiAction =
	| { type: "persona_changed" }
	| { type: "save_started" }
	| { type: "save_failed"; error: string }
	| { type: "save_succeeded"; settings: PersonaSettingsSummary }
	| { type: "save_finished" }
	| { type: "deploy_started" }
	| { type: "deploy_failed"; error: string }
	| {
			type: "deploy_succeeded";
			settings: PersonaSettingsSummary;
			message: string;
	  }
	| { type: "deploy_finished" };

export function createInitialPersonaSettingsUiState(
	initialSettings: PersonaSettingsSummary | null,
): PersonaSettingsUiState {
	return {
		savedSettings: initialSettings,
		isSaving: false,
		saveError: null,
		saveSuccess: null,
		isDeploying: false,
		deployError: null,
		deployResult: null,
	};
}

export function personaSettingsUiReducer(
	state: PersonaSettingsUiState,
	action: PersonaSettingsUiAction,
): PersonaSettingsUiState {
	switch (action.type) {
		case "persona_changed":
			return {
				...state,
				saveError: null,
				saveSuccess: null,
			};
		case "save_started":
			return {
				...state,
				isSaving: true,
				saveError: null,
				saveSuccess: null,
			};
		case "save_failed":
			return {
				...state,
				saveError: action.error,
			};
		case "save_succeeded":
			return {
				...state,
				savedSettings: action.settings,
				saveSuccess: "Persona saved.",
			};
		case "save_finished":
			return {
				...state,
				isSaving: false,
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
				savedSettings: action.settings,
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
