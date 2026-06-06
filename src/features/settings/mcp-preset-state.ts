export type McpFormMessage = { type: "success" | "error"; text: string } | null;

export type McpPresetState = {
	configuringPresetId: string | null;
	formMessage: McpFormMessage;
	isSaving: boolean;
};

export type McpPresetAction =
	| { type: "configure"; presetId: string }
	| { type: "cancel" }
	| { type: "set_message"; message: McpFormMessage }
	| { type: "set_saving"; isSaving: boolean }
	| { type: "saved"; message: string };

export const initialMcpPresetState: McpPresetState = {
	configuringPresetId: null,
	formMessage: null,
	isSaving: false,
};

export function mcpPresetReducer(
	state: McpPresetState,
	action: McpPresetAction,
): McpPresetState {
	switch (action.type) {
		case "configure":
			return {
				...state,
				configuringPresetId: action.presetId,
				formMessage: null,
			};
		case "cancel":
			return {
				...state,
				configuringPresetId: null,
				formMessage: null,
			};
		case "set_message":
			return { ...state, formMessage: action.message };
		case "set_saving":
			return { ...state, isSaving: action.isSaving };
		case "saved":
			return {
				...state,
				configuringPresetId: null,
				formMessage: { type: "success", text: action.message },
				isSaving: false,
			};
		default:
			return state;
	}
}
