import { CheckCircle2, LoaderCircle, Rocket } from "lucide-react";
import { useState } from "react";

import { AlertPanel } from "#/components/ui/alert-panel";
import { Button } from "#/components/ui/button";

import type { TelegramSettingsSummary } from "./telegram-settings";

type TelegramDeploySectionProps = {
	savedConfig: TelegramSettingsSummary;
	onConfigChange: (config: TelegramSettingsSummary) => void;
};

export function TelegramDeploySection({
	savedConfig,
	onConfigChange,
}: TelegramDeploySectionProps) {
	const [isDeploying, setIsDeploying] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	const isDeployed = Boolean(savedConfig.deployedServerHost);
	const deployedHost = savedConfig.deployedServerHost;

	async function handleDeploy() {
		setIsDeploying(true);
		setError(null);
		setSuccessMessage(null);

		try {
			const response = await fetch("/api/telegram/deploy", {
				method: "POST",
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				status?: string;
				serverHost?: string;
			} | null;

			if (!response.ok) {
				setError(payload?.error ?? "Deploy failed");
				return;
			}

			const serverHost = payload?.serverHost ?? null;
			onConfigChange({
				...savedConfig,
				deployedServerHost: serverHost,
			});
			setSuccessMessage(
				`Bot token deployed to ${
					serverHost ?? "server"
				}. Hermes is restarting...`,
			);
		} finally {
			setIsDeploying(false);
		}
	}

	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-6 flex flex-col gap-3">
				<p className="island-kicker m-0">Deploy to server</p>
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					Push the bot token to Hermes
				</h3>
				<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					Deploy the Telegram bot token to your Hermes server so it can send and
					receive messages through Telegram.
				</p>
			</div>

			{isDeployed && deployedHost ? (
				<AlertPanel
					tone="success"
					LeadingIcon={CheckCircle2}
					leadingIconClassName="h-5 w-5 text-[var(--alert-success-fg)]"
				>
					Deployed to <strong>{deployedHost}</strong>
				</AlertPanel>
			) : null}

			{successMessage ? (
				<AlertPanel
					tone="success"
					className="mt-3"
					LeadingIcon={CheckCircle2}
					leadingIconClassName="h-5 w-5 text-[var(--alert-success-fg)]"
				>
					{successMessage}
				</AlertPanel>
			) : null}

			{error ? (
				<AlertPanel tone="error" className="mt-3">
					{error}
				</AlertPanel>
			) : null}

			<div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
				<Button
					type="button"
					onClick={() => void handleDeploy()}
					disabled={isDeploying}
				>
					{isDeploying ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : (
						<Rocket className="h-4 w-4" />
					)}
					<span>
						{isDeploying
							? "Deploying..."
							: isDeployed
								? "Redeploy"
								: "Deploy to VPS"}
					</span>
				</Button>
			</div>
		</section>
	);
}
