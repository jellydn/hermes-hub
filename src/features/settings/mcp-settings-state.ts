import type { McpServerSummary } from "#server/settings/mcp/config";

import type { McpFormMessage } from "./mcp-form-message";
import {
	createEmptyFormState,
	formStateFromServer,
	type McpFormState,
} from "./mcp-form-state";

export type McpActivePanel =
	| { kind: "none" }
	| { kind: "preset"; presetName: string }
	| { kind: "form"; serverId: string | null; form: McpFormState };

export type McpSettingsUiState = {
	advancedOpen: boolean;
	panel: McpActivePanel;
	formMessage: McpFormMessage | null;
	isSaving: boolean;
	isDeleting: boolean;
};

export type McpSettingsAction =
	| { type: "configure_preset"; presetName: string }
	| { type: "edit_server"; server: McpServerSummary }
	| { type: "start_create" }
	| { type: "toggle_advanced" }
	| { type: "set_form"; form: McpFormState }
	| { type: "cancel_panel" }
	| { type: "set_message"; message: McpFormMessage | null }
	| { type: "set_saving"; isSaving: boolean }
	| { type: "set_deleting"; isDeleting: boolean }
	| {
			type: "saved";
			server: McpServerSummary;
			message: string;
			keepEditing: boolean;
	  }
	| { type: "deleted" };

export const initialMcpSettingsUiState: McpSettingsUiState = {
	advancedOpen: false,
	panel: { kind: "none" },
	formMessage: null,
	isSaving: false,
	isDeleting: false,
};

export function getEditingServerId(state: McpSettingsUiState): string | null {
	return state.panel.kind === "form" ? state.panel.serverId : null;
}

export function getConfiguringPresetName(
	state: McpSettingsUiState,
): string | null {
	return state.panel.kind === "preset" ? state.panel.presetName : null;
}

export function showAdvancedForm(state: McpSettingsUiState): boolean {
	return state.advancedOpen && state.panel.kind === "form";
}

export function getActiveForm(state: McpSettingsUiState): McpFormState | null {
	return state.panel.kind === "form" ? state.panel.form : null;
}

export function mcpSettingsReducer(
	state: McpSettingsUiState,
	action: McpSettingsAction,
): McpSettingsUiState {
	switch (action.type) {
		case "configure_preset":
			return {
				...state,
				advancedOpen: false,
				panel: { kind: "preset", presetName: action.presetName },
				formMessage: null,
			};
		case "edit_server":
			return {
				...state,
				advancedOpen: true,
				panel: {
					kind: "form",
					serverId: action.server.id,
					form: formStateFromServer(action.server),
				},
				formMessage: null,
			};
		case "start_create":
			return {
				...state,
				advancedOpen: true,
				panel: {
					kind: "form",
					serverId: null,
					form: createEmptyFormState(),
				},
				formMessage: null,
			};
		case "toggle_advanced":
			return { ...state, advancedOpen: !state.advancedOpen };
		case "set_form":
			if (state.panel.kind !== "form") {
				return state;
			}

			return {
				...state,
				panel: { ...state.panel, form: action.form },
			};
		case "cancel_panel":
			return {
				...state,
				panel: { kind: "none" },
				formMessage: null,
			};
		case "set_message":
			return { ...state, formMessage: action.message };
		case "set_saving":
			return { ...state, isSaving: action.isSaving };
		case "set_deleting":
			return { ...state, isDeleting: action.isDeleting };
		case "saved":
			return {
				...state,
				isSaving: false,
				formMessage: { type: "success", text: action.message },
				panel: action.keepEditing
					? {
							kind: "form",
							serverId: action.server.id,
							form: formStateFromServer(action.server),
						}
					: { kind: "none" },
				advancedOpen: action.keepEditing ? true : state.advancedOpen,
			};
		case "deleted":
			return {
				...state,
				isDeleting: false,
				panel: { kind: "none" },
				formMessage: null,
			};
		default:
			return state;
	}
}
