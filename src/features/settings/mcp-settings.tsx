import { useReducer, useState } from "react";

import type { TelegramDeployInfo } from "@/lib/load-telegram-deploy";
import type { McpServerSummary } from "../../../server/settings/mcp/config";
import { McpAdvancedSetupSection } from "./mcp-advanced-setup-section";
import { deleteMcpServer, persistMcpServer } from "./mcp-api";
import { McpFormMessageBanner } from "./mcp-form-message";
import {
	buildRequestBody,
	getFormValidationError,
	type McpFormState,
} from "./mcp-form-state";
import { McpPresetConfigureForm } from "./mcp-preset-configure-form";
import { McpRecommendedPresets } from "./mcp-recommended-presets";
import { McpSavedServersList } from "./mcp-saved-servers-list";
import { getMcpServerPreset, type McpServerPreset } from "./mcp-server-presets";
import { McpSettingsAside } from "./mcp-settings-aside";
import {
	getActiveForm,
	getConfiguringPresetName,
	getEditingServerId,
	initialMcpSettingsUiState,
	mcpSettingsReducer,
	showAdvancedForm,
} from "./mcp-settings-state";

type McpSettingsProps = {
	initialServers: McpServerSummary[];
	telegramDeploy?: TelegramDeployInfo | null;
};

const PRESET_SAVE_SUCCESS_MESSAGE =
	"MCP server saved. Deploy MCP settings to install it on your VPS.";

export function McpSettings({
	initialServers,
	telegramDeploy,
}: McpSettingsProps) {
	const [servers, setServers] = useState(() => initialServers);
	const [ui, dispatch] = useReducer(
		mcpSettingsReducer,
		initialMcpSettingsUiState,
	);

	const configuringPresetName = getConfiguringPresetName(ui);
	const configuringPreset = configuringPresetName
		? getMcpServerPreset(configuringPresetName)
		: undefined;
	const editingServerId = getEditingServerId(ui);
	const activeForm = getActiveForm(ui);

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

	function handleConfigurePreset(preset: McpServerPreset) {
		dispatch({ type: "configure_preset", presetName: preset.name });
	}

	function handleEditSaved(server: McpServerSummary) {
		dispatch({ type: "edit_server", server });
	}

	async function saveForm(
		form: McpFormState,
		options: {
			serverId: string | null;
			successMessage: string;
			keepEditing: boolean;
		},
	) {
		const validationError = getFormValidationError(form);
		if (validationError) {
			dispatch({
				type: "set_message",
				message: { type: "error", text: validationError },
			});
			return;
		}

		dispatch({ type: "set_saving", isSaving: true });
		dispatch({ type: "set_message", message: null });

		const body = buildRequestBody(form);
		const method = options.serverId ? "PUT" : "POST";
		const url = options.serverId
			? `/api/settings/mcp-servers/${options.serverId}`
			: "/api/settings/mcp-servers";

		const result = await persistMcpServer({ method, url, body });

		if (!result.ok) {
			dispatch({
				type: "set_message",
				message: { type: "error", text: result.error },
			});
			dispatch({ type: "set_saving", isSaving: false });
			return;
		}

		upsertServer(result.server);
		dispatch({
			type: "saved",
			server: result.server,
			message: options.successMessage,
			keepEditing: options.keepEditing,
		});
	}

	async function handleDelete(serverId: string) {
		dispatch({ type: "set_deleting", isDeleting: true });
		dispatch({ type: "set_message", message: null });

		const result = await deleteMcpServer(serverId);

		if (!result.ok) {
			dispatch({
				type: "set_message",
				message: { type: "error", text: result.error },
			});
			dispatch({ type: "set_deleting", isDeleting: false });
			return;
		}

		setServers((current) => current.filter((server) => server.id !== serverId));
		dispatch({ type: "deleted" });
	}

	return (
		<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
			<div className="space-y-4">
				<McpRecommendedPresets
					servers={servers}
					configuringPresetName={configuringPresetName}
					onConfigure={handleConfigurePreset}
					onEditSaved={handleEditSaved}
				/>

				{configuringPreset ? (
					<McpPresetConfigureForm
						preset={configuringPreset}
						isSaving={ui.isSaving}
						formMessage={ui.formMessage}
						onCancel={() => dispatch({ type: "cancel_panel" })}
						onSave={(form) =>
							void saveForm(form, {
								serverId: null,
								successMessage: PRESET_SAVE_SUCCESS_MESSAGE,
								keepEditing: false,
							})
						}
					/>
				) : ui.panel.kind === "none" ? (
					<McpFormMessageBanner message={ui.formMessage} />
				) : null}

				<McpSavedServersList
					servers={servers}
					editingId={editingServerId}
					isDeleting={ui.isDeleting}
					onEdit={handleEditSaved}
					onDelete={(serverId) => void handleDelete(serverId)}
				/>

				<McpAdvancedSetupSection
					advancedOpen={ui.advancedOpen}
					showForm={showAdvancedForm(ui)}
					editingId={editingServerId}
					form={activeForm}
					formMessage={ui.formMessage}
					isSaving={ui.isSaving}
					onToggleAdvanced={() => dispatch({ type: "toggle_advanced" })}
					onStartCreate={() => dispatch({ type: "start_create" })}
					onCancel={() => dispatch({ type: "cancel_panel" })}
					onSave={() => {
						if (!activeForm) {
							return;
						}

						void saveForm(activeForm, {
							serverId: editingServerId,
							successMessage: editingServerId
								? "MCP server updated."
								: "MCP server created.",
							keepEditing: true,
						});
					}}
					onFormChange={(form) => dispatch({ type: "set_form", form })}
				/>
			</div>

			<McpSettingsAside servers={servers} telegramDeploy={telegramDeploy} />
		</div>
	);
}
