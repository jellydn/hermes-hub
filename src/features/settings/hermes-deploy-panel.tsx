import { CloudUpload, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { HermesDeploymentTarget } from "@/lib/load-hermes-deployment-targets";

type DeployResponsePayload = {
	error?: string;
	serverId?: string;
	serverHost?: string;
	deployedAt?: string;
	serverCount?: number;
	skillCount?: number;
};

type HermesDeployPanelProps = {
	deploymentTargets: HermesDeploymentTarget[];
	description: string;
	deployUrl: string;
	buttonLabel: string;
	deployingLabel: string;
	canDeploy?: boolean;
	noDeploymentMessage: string;
	formatSuccess: (payload: DeployResponsePayload, serverHost: string) => string;
	selectedServerId?: string;
	onServerIdChange?: (serverId: string) => void;
};

export function HermesDeployPanel({
	deploymentTargets,
	description,
	deployUrl,
	buttonLabel,
	deployingLabel,
	canDeploy = true,
	noDeploymentMessage,
	formatSuccess,
	selectedServerId: controlledSelectedServerId,
	onServerIdChange,
}: HermesDeployPanelProps) {
	const [internalSelectedServerId, setInternalSelectedServerId] = useState(
		() => deploymentTargets[0]?.serverId ?? "",
	);
	const [isDeploying, setIsDeploying] = useState(false);
	const [deployError, setDeployError] = useState<string | null>(null);
	const [deployResult, setDeployResult] = useState<string | null>(null);

	const selectedServerId =
		controlledSelectedServerId !== undefined
			? controlledSelectedServerId
			: internalSelectedServerId;

	const selectedTarget =
		deploymentTargets.find((target) => target.serverId === selectedServerId) ??
		deploymentTargets[0];
	const hasTargets = deploymentTargets.length > 0;

	async function handleDeploy() {
		if (!selectedTarget) {
			return;
		}

		setIsDeploying(true);
		setDeployError(null);
		setDeployResult(null);

		try {
			const response = await fetch(deployUrl, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ serverId: selectedTarget.serverId }),
			});

			const payload = (await response
				.json()
				.catch(() => null)) as DeployResponsePayload | null;

			if (!response.ok) {
				setDeployError(payload?.error ?? "Deploy failed.");
				return;
			}

			const serverHost = payload?.serverHost ?? selectedTarget.host;
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
			{hasTargets ? (
				<>
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
						{description}
					</p>

					<div className="mt-4 space-y-2">
						<label
							htmlFor="hermes-deploy-target"
							className="text-sm font-medium text-[var(--sea-ink)]"
						>
							Deploy target
						</label>
						<select
							id="hermes-deploy-target"
							aria-label="Deploy target"
							value={selectedTarget?.serverId ?? ""}
							onChange={(event) => {
								const value = event.target.value;
								if (onServerIdChange) {
									onServerIdChange(value);
								} else {
									setInternalSelectedServerId(value);
								}
							}}
							className="w-full rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--sea-ink-soft)]"
						>
							{deploymentTargets.map((target) => (
								<option key={target.serverId} value={target.serverId}>
									{target.label} ({target.host})
								</option>
							))}
						</select>
					</div>

					<div className="mt-4">
						<Button
							type="button"
							onClick={() => void handleDeploy()}
							disabled={isDeploying || !canDeploy || !selectedTarget}
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
