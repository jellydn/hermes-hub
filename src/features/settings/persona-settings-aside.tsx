import { CloudUpload, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { TelegramDeployInfo } from "@/lib/load-telegram-deploy";
import type { PersonaSettingsSummary } from "../../../server/settings/config";

type PersonaSettingsAsideProps = {
	savedSettings: PersonaSettingsSummary | null;
	telegramDeploy?: TelegramDeployInfo | null;
	hasSavedPersona: boolean;
};

export function PersonaSettingsAside({
	savedSettings,
	telegramDeploy,
	hasSavedPersona,
}: PersonaSettingsAsideProps) {
	const [isDeploying, setIsDeploying] = useState(false);
	const [deployError, setDeployError] = useState<string | null>(null);
	const [deployResult, setDeployResult] = useState<string | null>(null);

	const canDeploy = hasSavedPersona && Boolean(telegramDeploy);

	async function handleDeploy() {
		setIsDeploying(true);
		setDeployError(null);
		setDeployResult(null);

		try {
			const response = await fetch("/api/settings/persona/deploy", {
				method: "POST",
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				serverHost?: string;
				deployedAt?: string;
			} | null;

			if (!response.ok) {
				setDeployError(payload?.error ?? "Deploy failed.");
				return;
			}

			const serverHost =
				payload?.serverHost ?? telegramDeploy?.deployedServerHost ?? "server";
			const deployedAt = payload?.deployedAt
				? new Date(payload.deployedAt).toLocaleString()
				: null;
			setDeployResult(
				deployedAt
					? `Persona deployed to ${serverHost} at ${deployedAt}. Hermes is restarting...`
					: `Persona deployed to ${serverHost}. Hermes is restarting...`,
			);
		} catch {
			setDeployError(
				"Network error. Please check your connection and try again.",
			);
		} finally {
			setIsDeploying(false);
		}
	}

	return (
		<aside className="space-y-4">
			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Saved state</p>
				<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
					{hasSavedPersona ? "Persona saved" : "No persona saved"}
				</h3>
				{savedSettings ? (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
						Last saved: {new Date(savedSettings.updatedAt).toLocaleString()}
					</p>
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
	);
}
