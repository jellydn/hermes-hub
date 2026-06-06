import { LoaderCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type McpFormMessage, McpFormMessageBanner } from "./mcp-form-message";
import {
	emptySecretRow,
	type McpFormState,
	mcpInputClassName,
	type SecretRow,
} from "./mcp-form-state";
import { McpSecretRowsEditor } from "./mcp-secret-rows-editor";
import { McpServerAdvancedOptions } from "./mcp-server-advanced-options";

type McpServerFormProps = {
	editingId: string | null;
	form: McpFormState;
	formMessage: McpFormMessage | null;
	isSaving: boolean;
	onCancel: () => void;
	onSave: () => void;
	onFormChange: (form: McpFormState) => void;
};

export function McpServerForm({
	editingId,
	form,
	formMessage,
	isSaving,
	onCancel,
	onSave,
	onFormChange,
}: McpServerFormProps) {
	function patchForm(patch: Partial<McpFormState>) {
		onFormChange({ ...form, ...patch });
	}

	function updateSecretRow(
		field: "envRows" | "headerRows",
		index: number,
		patch: Partial<SecretRow>,
	) {
		onFormChange({
			...form,
			[field]: form[field].map((row, rowIndex) =>
				rowIndex === index ? { ...row, ...patch } : row,
			),
		});
	}

	function addSecretRow(field: "envRows" | "headerRows") {
		onFormChange({
			...form,
			[field]: [...form[field], emptySecretRow()],
		});
	}

	function removeSecretRow(field: "envRows" | "headerRows", index: number) {
		const nextRows = form[field].filter((_, rowIndex) => rowIndex !== index);
		onFormChange({
			...form,
			[field]: nextRows.length > 0 ? nextRows : [emptySecretRow()],
		});
	}

	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-6">
				<p className="island-kicker m-0">
					{editingId ? "Edit server" : "New server"}
				</p>
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					{editingId ? "Update MCP server" : "Add MCP server"}
				</h3>
			</div>

			<div className="space-y-5">
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<label
							htmlFor="mcp-server-name"
							className="text-sm font-medium text-[var(--sea-ink)]"
						>
							Server name
						</label>
						<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
							Used as the key in Hermes config.yaml.
						</p>
						<input
							id="mcp-server-name"
							value={form.name}
							onChange={(event) => patchForm({ name: event.target.value })}
							className={mcpInputClassName}
							placeholder="github"
						/>
					</div>

					<fieldset className="space-y-2">
						<legend className="text-sm font-medium text-[var(--sea-ink)]">
							Transport
						</legend>
						<div className="flex flex-wrap gap-3">
							<label className="flex items-center gap-2 text-sm text-[var(--sea-ink)]">
								<input
									type="radio"
									name="mcp-transport"
									checked={form.transport === "stdio"}
									onChange={() => patchForm({ transport: "stdio" })}
								/>
								Stdio
							</label>
							<label className="flex items-center gap-2 text-sm text-[var(--sea-ink)]">
								<input
									type="radio"
									name="mcp-transport"
									checked={form.transport === "http"}
									onChange={() => patchForm({ transport: "http" })}
								/>
								HTTP
							</label>
						</div>
					</fieldset>
				</div>

				<label className="flex items-center gap-2 text-sm text-[var(--sea-ink)]">
					<input
						type="checkbox"
						checked={form.enabled}
						onChange={(event) => patchForm({ enabled: event.target.checked })}
					/>
					Enabled
				</label>

				{form.transport === "stdio" ? (
					<McpStdioFields
						form={form}
						onPatch={patchForm}
						onAddEnvRow={() => addSecretRow("envRows")}
						onRemoveEnvRow={(index) => removeSecretRow("envRows", index)}
						onEnvRowChange={(index, patch) =>
							updateSecretRow("envRows", index, patch)
						}
					/>
				) : (
					<McpHttpFields
						form={form}
						onPatch={patchForm}
						onAddHeaderRow={() => addSecretRow("headerRows")}
						onRemoveHeaderRow={(index) => removeSecretRow("headerRows", index)}
						onHeaderRowChange={(index, patch) =>
							updateSecretRow("headerRows", index, patch)
						}
					/>
				)}

				<McpServerAdvancedOptions form={form} onPatch={patchForm} />
			</div>

			<McpFormMessageBanner
				message={formMessage}
				className="mt-4 mb-0 text-sm"
			/>

			<div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
				<Button type="button" onClick={onSave} disabled={isSaving}>
					{isSaving ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : (
						<Save className="h-4 w-4" />
					)}
					<span>{isSaving ? "Saving..." : "Save server"}</span>
				</Button>
				<Button type="button" variant="secondary" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</section>
	);
}

type McpStdioFieldsProps = {
	form: McpFormState;
	onPatch: (patch: Partial<McpFormState>) => void;
	onAddEnvRow: () => void;
	onRemoveEnvRow: (index: number) => void;
	onEnvRowChange: (index: number, patch: Partial<SecretRow>) => void;
};

function McpStdioFields({
	form,
	onPatch,
	onAddEnvRow,
	onRemoveEnvRow,
	onEnvRowChange,
}: McpStdioFieldsProps) {
	return (
		<>
			<div className="space-y-2">
				<label
					htmlFor="mcp-command"
					className="text-sm font-medium text-[var(--sea-ink)]"
				>
					Command
				</label>
				<input
					id="mcp-command"
					value={form.command}
					onChange={(event) => onPatch({ command: event.target.value })}
					className={mcpInputClassName}
					placeholder="npx"
				/>
			</div>

			<div className="space-y-2">
				<label
					htmlFor="mcp-args"
					className="text-sm font-medium text-[var(--sea-ink)]"
				>
					Args
				</label>
				<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
					One argument per line.
				</p>
				<textarea
					id="mcp-args"
					value={form.argsText}
					onChange={(event) => onPatch({ argsText: event.target.value })}
					rows={4}
					className={cn(mcpInputClassName, "resize-y")}
					placeholder={"-y\n@modelcontextprotocol/server-github"}
				/>
			</div>

			<McpSecretRowsEditor
				label="Environment variables"
				rows={form.envRows}
				onAdd={onAddEnvRow}
				onRemove={onRemoveEnvRow}
				onChange={onEnvRowChange}
			/>
		</>
	);
}

type McpHttpFieldsProps = {
	form: McpFormState;
	onPatch: (patch: Partial<McpFormState>) => void;
	onAddHeaderRow: () => void;
	onRemoveHeaderRow: (index: number) => void;
	onHeaderRowChange: (index: number, patch: Partial<SecretRow>) => void;
};

function McpHttpFields({
	form,
	onPatch,
	onAddHeaderRow,
	onRemoveHeaderRow,
	onHeaderRowChange,
}: McpHttpFieldsProps) {
	return (
		<>
			<div className="space-y-2">
				<label
					htmlFor="mcp-url"
					className="text-sm font-medium text-[var(--sea-ink)]"
				>
					URL
				</label>
				<input
					id="mcp-url"
					value={form.url}
					onChange={(event) => onPatch({ url: event.target.value })}
					className={mcpInputClassName}
					placeholder="https://mcp.example.com"
				/>
			</div>

			<McpSecretRowsEditor
				label="Headers"
				rows={form.headerRows}
				onAdd={onAddHeaderRow}
				onRemove={onRemoveHeaderRow}
				onChange={onHeaderRowChange}
			/>
		</>
	);
}
