import { LoaderCircle, Save } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { type McpFormMessage, McpFormMessageBanner } from "./mcp-form-message";
import {
	formStateFromPreset,
	type McpFormState,
	type McpPresetOverrides,
	mcpInputClassName,
} from "./mcp-form-state";
import type { McpServerPreset } from "./mcp-server-presets";

type McpPresetConfigureFormProps = {
	preset: McpServerPreset;
	isSaving: boolean;
	formMessage: McpFormMessage | null;
	onCancel: () => void;
	onSave: (form: McpFormState) => void;
};

export function McpPresetConfigureForm({
	preset,
	isSaving,
	formMessage,
	onCancel,
	onSave,
}: McpPresetConfigureFormProps) {
	const [overrides, setOverrides] = useState<McpPresetOverrides>(() => {
		const initial: McpPresetOverrides = {};

		for (const field of preset.configurableFields ?? []) {
			initial[field.id] = field.defaultValue;
		}

		return initial;
	});

	const previewForm = formStateFromPreset(preset, overrides);

	function handleSave() {
		onSave(formStateFromPreset(preset, overrides));
	}

	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-6">
				<p className="island-kicker m-0">Recommended server</p>
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					Configure {preset.title}
				</h3>
				<p className="m-0 mt-2 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					{preset.description}
				</p>
			</div>

			<div className="space-y-4">
				<div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--sea-ink-soft)]">
					<p className="m-0">
						<span className="font-medium text-[var(--sea-ink)]">Command:</span>{" "}
						{preset.command}
					</p>
					<p className="m-0 mt-2">
						<span className="font-medium text-[var(--sea-ink)]">Args:</span>{" "}
						{previewForm.argsText.replaceAll("\n", " ")}
					</p>
				</div>

				{preset.configurableFields?.map((field) => (
					<div key={field.id} className="space-y-2">
						<label
							htmlFor={`preset-${preset.name}-${field.id}`}
							className="text-sm font-medium text-[var(--sea-ink)]"
						>
							{field.label}
						</label>
						<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
							{field.description}
						</p>
						<input
							id={`preset-${preset.name}-${field.id}`}
							aria-label={field.label}
							value={overrides[field.id] ?? field.defaultValue}
							onChange={(event) =>
								setOverrides((current) => ({
									...current,
									[field.id]: event.target.value,
								}))
							}
							className={mcpInputClassName}
						/>
					</div>
				))}
			</div>

			<McpFormMessageBanner
				message={formMessage}
				className="mt-4 mb-0 text-sm"
			/>

			<div className="mt-6 flex flex-wrap gap-3">
				<Button type="button" onClick={handleSave} disabled={isSaving}>
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
