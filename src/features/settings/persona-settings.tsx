import { LoaderCircle, Save } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { FormFeedback } from "#/components/ui/form-feedback";
import type { HermesDeploymentTarget } from "#/lib/load-hermes-deployment-targets";
import type { PersonaSettingsSummary } from "#server/settings/config";

import { PersonaSettingsAside } from "./persona-settings-aside";

type PersonaSettingsProps = {
	initialSettings: PersonaSettingsSummary | null;
	deploymentTargets: HermesDeploymentTarget[];
};

export function PersonaSettings({
	initialSettings,
	deploymentTargets,
}: PersonaSettingsProps) {
	const [savedSettings, setSavedSettings] =
		useState<PersonaSettingsSummary | null>(initialSettings);
	const [persona, setPersona] = useState(initialSettings?.agentPersona ?? "");
	const [isSaving, setIsSaving] = useState(false);
	const [saveMessage, setSaveMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	const hasSavedPersona = Boolean(savedSettings?.agentPersona);

	async function handleSave() {
		setIsSaving(true);
		setSaveMessage(null);

		try {
			const response = await fetch("/api/settings/persona", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ agentPersona: persona }),
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				settings?: PersonaSettingsSummary;
			} | null;

			if (!response.ok || !payload?.settings) {
				setSaveMessage({
					type: "error",
					text: payload?.error ?? "Unable to save persona settings.",
				});
				return;
			}

			setSavedSettings(payload.settings);
			setPersona(payload.settings.agentPersona);
			setSaveMessage({ type: "success", text: "Persona saved." });
		} catch {
			setSaveMessage({
				type: "error",
				text: "Network error. Please check your connection and try again.",
			});
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
			<section className="island-shell rounded-[2rem] p-6 sm:p-8">
				<div className="mb-6 flex flex-col gap-3">
					<p className="island-kicker m-0">Agent persona</p>
					<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
						Hermes SOUL.md
					</h3>
					<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
						Define how Hermes speaks, reasons, and presents itself. Saved
						content is written to SOUL.md on your deployed Hermes server.
					</p>
				</div>

				<div className="space-y-2">
					<label
						htmlFor="agent-persona"
						className="text-sm font-medium text-[var(--sea-ink)]"
					>
						Persona content
					</label>
					<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
						Up to 20,000 characters. Markdown is supported.
					</p>
					<textarea
						id="agent-persona"
						value={persona}
						onChange={(event) => {
							setPersona(event.target.value);
							setSaveMessage(null);
						}}
						rows={18}
						className="mt-2 w-full resize-y rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--sea-ink-soft)]"
						placeholder="You are Hermes, a thoughtful assistant..."
					/>
				</div>

				{saveMessage ? (
					<FormFeedback className="mt-4 mb-0 text-sm" tone={saveMessage.type}>
						{saveMessage.text}
					</FormFeedback>
				) : null}

				<div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
					<Button
						type="button"
						onClick={() => void handleSave()}
						disabled={isSaving}
					>
						{isSaving ? (
							<LoaderCircle className="h-4 w-4 animate-spin" />
						) : (
							<Save className="h-4 w-4" />
						)}
						<span>{isSaving ? "Saving..." : "Save persona"}</span>
					</Button>
				</div>
			</section>

			<PersonaSettingsAside
				savedSettings={savedSettings}
				deploymentTargets={deploymentTargets}
				hasSavedPersona={hasSavedPersona}
			/>
		</div>
	);
}
