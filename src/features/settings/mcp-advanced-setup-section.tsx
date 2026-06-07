import { Plus } from "lucide-react";

import { Button } from "#/components/ui/button";
import type { McpFormMessage } from "./mcp-form-message";
import type { McpFormState } from "./mcp-form-state";
import { McpServerForm } from "./mcp-server-form";

type McpAdvancedSetupSectionProps = {
	advancedOpen: boolean;
	showForm: boolean;
	editingId: string | null;
	form: McpFormState | null;
	formMessage: McpFormMessage | null;
	isSaving: boolean;
	onToggleAdvanced: () => void;
	onStartCreate: () => void;
	onCancel: () => void;
	onSave: () => void;
	onFormChange: (form: McpFormState) => void;
};

export function McpAdvancedSetupSection({
	advancedOpen,
	showForm,
	editingId,
	form,
	formMessage,
	isSaving,
	onToggleAdvanced,
	onStartCreate,
	onCancel,
	onSave,
	onFormChange,
}: McpAdvancedSetupSectionProps) {
	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="island-kicker m-0">Advanced setup</p>
					<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
						Custom MCP configuration
					</h3>
					<p className="m-0 mt-2 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
						Define stdio or HTTP MCP servers manually when you need full control
						over command, URL, secrets, and tool filters.
					</p>
				</div>
				<Button type="button" variant="secondary" onClick={onToggleAdvanced}>
					{advancedOpen ? "Hide advanced setup" : "Advanced setup"}
				</Button>
			</div>

			{advancedOpen ? (
				<div className="mt-6 space-y-4">
					<Button type="button" onClick={onStartCreate}>
						<Plus className="h-4 w-4" />
						<span>Add custom server</span>
					</Button>

					{showForm && form ? (
						<McpServerForm
							editingId={editingId}
							form={form}
							formMessage={formMessage}
							isSaving={isSaving}
							onCancel={onCancel}
							onSave={onSave}
							onFormChange={onFormChange}
						/>
					) : null}
				</div>
			) : null}
		</section>
	);
}
