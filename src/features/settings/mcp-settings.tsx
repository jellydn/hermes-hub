import { Plus, Trash2 } from "lucide-react";
import { useReducer, useState } from "react";

import { Button } from "@/components/ui/button";
import type { TelegramDeployInfo } from "@/lib/load-telegram-deploy";
import { cn } from "@/lib/utils";
import type { McpServerSummary } from "../../../server/settings/mcp/config";

import {
	buildRequestBody,
	createEmptyFormState,
	formStateFromServer,
	type McpFormState,
} from "./mcp-form-state";
import { McpServerForm } from "./mcp-server-form";
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

	const showForm = editor.isCreating || editor.editingId !== null;

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

			setServers((current) => {
				const withoutCurrent = current.filter(
					(server) => server.id !== savedServer.id,
				);
				return [...withoutCurrent, savedServer].sort((left, right) =>
					left.name.localeCompare(right.name),
				);
			});
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
				<section className="island-shell rounded-[2rem] p-6 sm:p-8">
					<div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<p className="island-kicker m-0">MCP servers</p>
							<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
								Custom MCP configuration
							</h3>
							<p className="m-0 mt-2 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
								Define stdio or HTTP MCP servers for Hermes. Saved settings stay
								in HermesHub until you deploy them to config.yaml on your VPS.
							</p>
						</div>
						<Button
							type="button"
							onClick={() => dispatch({ type: "start_create" })}
						>
							<Plus className="h-4 w-4" />
							<span>Add server</span>
						</Button>
					</div>

					{servers.length === 0 ? (
						<p className="m-0 text-sm text-[var(--sea-ink-soft)]">
							No MCP servers saved yet.
						</p>
					) : (
						<ul className="m-0 list-none space-y-3 p-0">
							{servers.map((server) => (
								<li
									key={server.id}
									className={cn(
										"rounded-[1.25rem] border border-[var(--line)] p-4",
										editor.editingId === server.id &&
											"border-[var(--sea-ink-soft)]",
									)}
								>
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div>
											<p className="m-0 font-semibold text-[var(--sea-ink)]">
												{server.name}
											</p>
											<p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">
												{server.transport.toUpperCase()} ·{" "}
												{server.enabled ? "Enabled" : "Disabled"}
											</p>
										</div>
										<div className="flex flex-wrap gap-2">
											<Button
												type="button"
												variant="secondary"
												onClick={() => dispatch({ type: "start_edit", server })}
											>
												Edit
											</Button>
											<Button
												type="button"
												variant="secondary"
												onClick={() => void handleDelete(server.id)}
												disabled={editor.isDeleting}
											>
												<Trash2 className="h-4 w-4" />
												<span>Delete</span>
											</Button>
										</div>
									</div>
								</li>
							))}
						</ul>
					)}
				</section>

				{showForm ? (
					<McpServerForm
						editingId={editor.editingId}
						form={editor.form}
						formMessage={editor.formMessage}
						isSaving={editor.isSaving}
						onCancel={() => dispatch({ type: "cancel" })}
						onSave={() => void handleSave()}
						onFormChange={(form) => dispatch({ type: "set_form", form })}
					/>
				) : null}
			</div>

			<McpSettingsAside servers={servers} telegramDeploy={telegramDeploy} />
		</div>
	);
}
