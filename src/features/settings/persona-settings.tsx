import { CloudUpload, LoaderCircle, Save } from "lucide-react";
import { useReducer, useState } from "react";

import { Button } from "@/components/ui/button";

import {
	createInitialPersonaSettingsUiState,
	personaSettingsUiReducer,
} from "./persona-settings-state";

export type PersonaSettingsSummary = {
	agentPersona: string;
	deployedServerHost: string | null;
	deployedAt: string | null;
	updatedAt: string;
};

type TelegramDeployInfo = {
	deployedServerHost: string;
};

type PersonaSettingsProps = {
	initialSettings: PersonaSettingsSummary | null;
	telegramDeploy?: TelegramDeployInfo | null;
};

export function PersonaSettings({
	initialSettings,
	telegramDeploy,
}: PersonaSettingsProps) {
	const [uiState, dispatch] = useReducer(
		personaSettingsUiReducer,
		initialSettings,
		createInitialPersonaSettingsUiState,
	);
	const [persona, setPersona] = useState(initialSettings?.agentPersona ?? "");

	const {
		savedSettings,
		isSaving,
		saveError,
		saveSuccess,
		isDeploying,
		deployError,
		deployResult,
	} = uiState;
	const hasSavedPersona = Boolean(savedSettings?.agentPersona);
	const canDeploy = hasSavedPersona && Boolean(telegramDeploy);

	async function handleSave() {
		dispatch({ type: "save_started" });

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
				dispatch({
					type: "save_failed",
					error: payload?.error ?? "Unable to save persona settings.",
				});
				return;
			}

			setPersona(payload.settings.agentPersona);
			dispatch({ type: "save_succeeded", settings: payload.settings });
		} finally {
			dispatch({ type: "save_finished" });
		}
	}

	async function handleDeploy() {
		dispatch({ type: "deploy_started" });

		try {
			const response = await fetch("/api/settings/persona/deploy", {
				method: "POST",
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				status?: string;
				serverHost?: string;
			} | null;

			if (!response.ok) {
				dispatch({
					type: "deploy_failed",
					error: payload?.error ?? "Deploy failed.",
				});
				return;
			}

			const serverHost =
				payload?.serverHost ?? savedSettings?.deployedServerHost;
			const nextSettings = savedSettings
				? {
						...savedSettings,
						deployedServerHost: serverHost ?? savedSettings.deployedServerHost,
						deployedAt: new Date().toISOString(),
					}
				: null;

			if (!nextSettings) {
				dispatch({
					type: "deploy_failed",
					error: "Deploy succeeded but persona settings are missing.",
				});
				return;
			}

			dispatch({
				type: "deploy_succeeded",
				settings: nextSettings,
				message: `Persona deployed to ${serverHost ?? "server"}. Hermes is restarting...`,
			});
		} finally {
			dispatch({ type: "deploy_finished" });
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
							dispatch({ type: "persona_changed" });
						}}
						rows={18}
						className="mt-2 w-full resize-y rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--sea-ink-soft)]"
						placeholder="You are Hermes, a thoughtful assistant..."
					/>
				</div>

				{saveError ? (
					<p className="mt-4 mb-0 text-sm text-red-600">{saveError}</p>
				) : null}
				{saveSuccess ? (
					<p className="mt-4 mb-0 text-sm text-emerald-600">{saveSuccess}</p>
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

			<aside className="space-y-4">
				<section className="island-shell rounded-[2rem] p-6">
					<p className="island-kicker mb-2">Saved state</p>
					<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
						{hasSavedPersona ? "Persona saved" : "No persona saved"}
					</h3>
					{savedSettings ? (
						<>
							<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
								Last saved: {new Date(savedSettings.updatedAt).toLocaleString()}
							</p>
							{savedSettings.deployedServerHost ? (
								<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
									Last deployed to {savedSettings.deployedServerHost}
								</p>
							) : null}
							{savedSettings.deployedAt ? (
								<p className="mt-3 mb-0 text-xs text-[var(--sea-ink-soft)]">
									Deployed:{" "}
									{new Date(savedSettings.deployedAt).toLocaleString()}
								</p>
							) : null}
						</>
					) : (
						<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
							Save persona content before deploying to Hermes.
						</p>
					)}
				</section>

				<section className="island-shell rounded-[2rem] p-6">
					<p className="island-kicker mb-2">Hermes deployment</p>
					{telegramDeploy ? (
						<>
							<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
								Push your saved persona to the Telegram-deployed Hermes server.
							</p>
							<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
								Target:{" "}
								<span className="font-semibold text-[var(--sea-ink)]">
									{telegramDeploy.deployedServerHost}
								</span>
							</p>
							<div className="mt-4">
								<Button
									type="button"
									onClick={() => void handleDeploy()}
									disabled={isDeploying || !canDeploy}
								>
									{isDeploying ? (
										<LoaderCircle className="h-4 w-4 animate-spin" />
									) : (
										<CloudUpload className="h-4 w-4" />
									)}
									<span>
										{isDeploying ? "Deploying..." : "Deploy to Hermes Server"}
									</span>
								</Button>
							</div>
							{deployError ? (
								<p className="mt-3 mb-0 text-sm text-red-600">{deployError}</p>
							) : null}
							{deployResult ? (
								<p className="mt-3 mb-0 text-sm text-emerald-600">
									{deployResult}
								</p>
							) : null}
						</>
					) : (
						<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
							Deploy a Telegram bot to a VPS first to enable persona deployment.
						</p>
					)}
				</section>
			</aside>
		</div>
	);
}
