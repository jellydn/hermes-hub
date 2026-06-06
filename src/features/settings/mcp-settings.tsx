import { useReducer, useState } from "react";

import type { TelegramDeployInfo } from "@/lib/load-telegram-deploy";
import type { McpServerSummary } from "../../../server/settings/mcp/config";

import { McpAdvancedSetupSection } from "./mcp-advanced-setup-section";
import {
	buildRequestBody,
	createEmptyFormState,
	formStateFromServer,
	type McpFormState,
} from "./mcp-form-state";
import { McpPresetConfigureForm } from "./mcp-preset-configure-form";
import { initialMcpPresetState, mcpPresetReducer } from "./mcp-preset-state";
import { McpRecommendedPresets } from "./mcp-recommended-presets";
import { McpSavedServersList } from "./mcp-saved-servers-list";
import { getMcpServerPreset, type McpServerPreset } from "./mcp-server-presets";
import { McpSettingsAside } from "./mcp-settings-aside";

type McpSettingsProps = {
	initialServers: McpServerSummary[];
	telegramDeploy?: TelegramDeployInfo | null;
};

type EditorState = {
	editingId: string | null;
	isCreating: boolean;
	form: McpFormState;
	formMessage: { type: "success" | "error"; text: string } | null;
	isSaving: boolean;
	isDeleting: boolean;
};

type EditorAction =
	| { type: "start_create" }
	| { type: "start_edit"; server: McpServerSummary }
	| { type: "cancel" }
	| { type: "set_form"; form: McpFormState }
	| { type: "set_message"; message: EditorState["formMessage"] }
	| { type: "set_saving"; isSaving: boolean }
	| { type: "set_deleting"; isDeleting: boolean }
	| { type: "saved"; server: McpServerSummary; isUpdate: boolean };

const initialEditorState: EditorState = {
	editingId: null,
	isCreating: false,
	form: createEmptyFormState(),
	formMessage: null,
	isSaving: false,
	isDeleting: false,
};

const PRESET_SAVE_SUCCESS_MESSAGE =
	"MCP server saved. Deploy MCP settings to install it on your VPS.";

function editorReducer(state: EditorState, action: EditorAction): EditorState {
	switch (action.type) {
		case "start_create":
			return {
				...state,
				editingId: null,
				isCreating: true,
				form: createEmptyFormState(),
				formMessage: null,
			};
		case "start_edit":
			return {
				...state,
				isCreating: false,
				editingId: action.server.id,
				form: formStateFromServer(action.server),
				formMessage: null,
			};
		case "cancel":
			return {
				...state,
				editingId: null,
				isCreating: false,
				form: createEmptyFormState(),
				formMessage: null,
			};
		case "set_form":
			return { ...state, form: action.form };
		case "set_message":
			return { ...state, formMessage: action.message };
		case "set_saving":
			return { ...state, isSaving: action.isSaving };
		case "set_deleting":
			return { ...state, isDeleting: action.isDeleting };
		case "saved":
			return {
				...state,
				isCreating: false,
				editingId: action.server.id,
				form: formStateFromServer(action.server),
				formMessage: {
					type: "success",
					text: action.isUpdate ? "MCP server updated." : "MCP server created.",
				},
			};
		default:
			return state;
	}
}

export function McpSettings({
	initialServers,
	telegramDeploy,
}: McpSettingsProps) {
	const [servers, setServers] = useState(() => initialServers);
	const [editor, dispatch] = useReducer(editorReducer, initialEditorState);
	const [preset, dispatchPreset] = useReducer(
		mcpPresetReducer,
		initialMcpPresetState,
	);
	const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);

	const configuringPreset = preset.configuringPresetId
		? getMcpServerPreset(preset.configuringPresetId)
		: undefined;
	const showAdvancedForm =
		showAdvancedSetup && (editor.isCreating || editor.editingId !== null);

	function upsertServer(savedServer: McpServerSummary) {
		setServers((current) => {
			const withoutCurrent = current.filter(
				(server) => server.id !== savedServer.id,
			);
			return [...withoutCurrent, savedServer].sort((left, right) =>
				left.name.localeCompare(right.name),
			);
		});
	}

	function handleConfigurePreset(presetItem: McpServerPreset) {
		dispatch({ type: "cancel" });
		setShowAdvancedSetup(false);
		dispatchPreset({ type: "configure", presetId: presetItem.id });
	}

	function handleEditSaved(server: McpServerSummary) {
		dispatchPreset({ type: "cancel" });
		setShowAdvancedSetup(true);
		dispatch({ type: "start_edit", server });
	}

	async function handlePresetSave(body: ReturnType<typeof buildRequestBody>) {
		dispatchPreset({ type: "set_saving", isSaving: true });
		dispatchPreset({ type: "set_message", message: null });

		try {
			const response = await fetch("/api/settings/mcp-servers", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				server?: McpServerSummary;
			} | null;

			const savedServer = payload?.server;
			if (!response.ok || !savedServer) {
				dispatchPreset({
					type: "set_message",
					message: {
						type: "error",
						text: payload?.error ?? "Unable to save MCP server.",
					},
				});
				return;
			}

			upsertServer(savedServer);
			dispatchPreset({
				type: "saved",
				message: PRESET_SAVE_SUCCESS_MESSAGE,
			});
		} catch {
			dispatchPreset({
				type: "set_message",
				message: {
					type: "error",
					text: "Network error. Please check your connection and try again.",
				},
			});
		} finally {
			dispatchPreset({ type: "set_saving", isSaving: false });
		}
	}

	async function handleSave() {
		dispatch({ type: "set_saving", isSaving: true });
		dispatch({ type: "set_message", message: null });

		const body = buildRequestBody(editor.form);
		const url = editor.editingId
			? `/api/settings/mcp-servers/${editor.editingId}`
			: "/api/settings/mcp-servers";
		const method = editor.editingId ? "PUT" : "POST";

		try {
			const response = await fetch(url, {
				method,
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				server?: McpServerSummary;
			} | null;

			const savedServer = payload?.server;
			if (!response.ok || !savedServer) {
				dispatch({
					type: "set_message",
					message: {
						type: "error",
						text: payload?.error ?? "Unable to save MCP server.",
					},
				});
				return;
			}

			upsertServer(savedServer);
			dispatch({
				type: "saved",
				server: savedServer,
				isUpdate: Boolean(editor.editingId),
			});
		} catch {
			dispatch({
				type: "set_message",
				message: {
					type: "error",
					text: "Network error. Please check your connection and try again.",
				},
			});
		} finally {
			dispatch({ type: "set_saving", isSaving: false });
		}
	}

	async function handleDelete(serverId: string) {
		dispatch({ type: "set_deleting", isDeleting: true });
		dispatch({ type: "set_message", message: null });

		try {
			const response = await fetch(`/api/settings/mcp-servers/${serverId}`, {
				method: "DELETE",
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
			} | null;

			if (!response.ok) {
				dispatch({
					type: "set_message",
					message: {
						type: "error",
						text: payload?.error ?? "Unable to delete MCP server.",
					},
				});
				return;
			}

			setServers((current) =>
				current.filter((server) => server.id !== serverId),
			);
			dispatch({ type: "cancel" });
		} catch {
			dispatch({
				type: "set_message",
				message: {
					type: "error",
					text: "Network error. Please check your connection and try again.",
				},
			});
		} finally {
			dispatch({ type: "set_deleting", isDeleting: false });
		}
	}

	return (
		<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
			<div className="space-y-4">
				<McpRecommendedPresets
					servers={servers}
					configuringPresetId={preset.configuringPresetId}
					onConfigure={handleConfigurePreset}
					onEditSaved={handleEditSaved}
				/>

				{preset.formMessage && !configuringPreset ? (
					<p
						className={`m-0 text-sm ${
							preset.formMessage.type === "error"
								? "text-red-600"
								: "text-emerald-600"
						}`}
					>
						{preset.formMessage.text}
					</p>
				) : null}

				{configuringPreset ? (
					<McpPresetConfigureForm
						preset={configuringPreset}
						isSaving={preset.isSaving}
						formMessage={preset.formMessage}
						onCancel={() => dispatchPreset({ type: "cancel" })}
						onSave={(body) => void handlePresetSave(body)}
					/>
				) : null}

				<McpSavedServersList
					servers={servers}
					editingId={editor.editingId}
					isDeleting={editor.isDeleting}
					onEdit={handleEditSaved}
					onDelete={(serverId) => void handleDelete(serverId)}
				/>

				<McpAdvancedSetupSection
					showAdvancedSetup={showAdvancedSetup}
					showAdvancedForm={showAdvancedForm}
					editingId={editor.editingId}
					form={editor.form}
					formMessage={editor.formMessage}
					isSaving={editor.isSaving}
					onToggleAdvancedSetup={() =>
						setShowAdvancedSetup((current) => !current)
					}
					onStartCreate={() => {
						dispatchPreset({ type: "cancel" });
						dispatch({ type: "start_create" });
					}}
					onCancel={() => dispatch({ type: "cancel" })}
					onSave={() => void handleSave()}
					onFormChange={(form) => dispatch({ type: "set_form", form })}
				/>
			</div>

			<McpSettingsAside servers={servers} telegramDeploy={telegramDeploy} />
		</div>
	);
}
