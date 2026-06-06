import { CloudUpload, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { TelegramDeployInfo } from "@/lib/load-telegram-deploy";

type DeployResponsePayload = {
	error?: string;
	serverHost?: string;
	deployedAt?: string;
	serverCount?: number;
};

type HermesDeployPanelProps = {
	telegramDeploy?: TelegramDeployInfo | null;
	description: string;
	deployUrl: string;
	buttonLabel: string;
	deployingLabel: string;
	canDeploy?: boolean;
	noDeploymentMessage: string;
	formatSuccess: (payload: DeployResponsePayload, serverHost: string) => string;
};

export function HermesDeployPanel({
	telegramDeploy,
	description,
	deployUrl,
	buttonLabel,
	deployingLabel,
	canDeploy = true,
	noDeploymentMessage,
	formatSuccess,
}: HermesDeployPanelProps) {
	const [isDeploying, setIsDeploying] = useState(false);
	const [deployError, setDeployError] = useState<string | null>(null);
	const [deployResult, setDeployResult] = useState<string | null>(null);

	async function handleDeploy() {
		setIsDeploying(true);
		setDeployError(null);
		setDeployResult(null);

		try {
			const response = await fetch(deployUrl, {
				method: "POST",
			});

			const payload = (await response
				.json()
				.catch(() => null)) as DeployResponsePayload | null;

			if (!response.ok) {
				setDeployError(payload?.error ?? "Deploy failed.");
				return;
			}

			const serverHost =
				payload?.serverHost ?? telegramDeploy?.deployedServerHost ?? "server";
			setDeployResult(formatSuccess(payload ?? {}, serverHost));
		} catch {
			setDeployError(
				"Network error. Please check your connection and try again.",
			);
		} finally {
			setIsDeploying(false);
		}
	}

	return (
		<section className="island-shell rounded-[2rem] p-6">
			<p className="island-kicker mb-2">Hermes deployment</p>
			{telegramDeploy ? (
				<>
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
						{description}
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
							<span>{isDeploying ? deployingLabel : buttonLabel}</span>
						</Button>
					</div>
					{deployError ? (
						<p className="mt-3 mb-0 text-sm text-red-600">{deployError}</p>
					) : null}
					{deployResult ? (
						<p className="mt-3 mb-0 text-sm text-emerald-600">{deployResult}</p>
					) : null}
				</>
			) : (
				<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
					{noDeploymentMessage}
				</p>
			)}
		</section>
	);
}
