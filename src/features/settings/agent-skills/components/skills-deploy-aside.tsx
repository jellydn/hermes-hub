import { LoaderCircle } from "lucide-react";
import type { HermesDeploymentTarget } from "@/lib/load-hermes-deployment-targets";
import type { AgentSkillSummary } from "../../../../../shared/contracts/agent-skills";
import type { DeployResponsePayload } from "../../hermes-deploy-panel";
import { HermesDeployPanel } from "../../hermes-deploy-panel";

type RemoteInventoryState = {
	raw: string;
	skills: string[];
	count: number;
} | null;

type SkillsDeployAsideProps = {
	skills: AgentSkillSummary[];
	enabledCount: number;
	deploymentTargets: HermesDeploymentTarget[];
	selectedServerId: string;
	onServerIdChange: (serverId: string) => void;
	remoteInventory: RemoteInventoryState;
	remoteLoading: boolean;
	remoteError: string | null;
};

export function SkillsDeployAside({
	skills,
	enabledCount,
	deploymentTargets,
	selectedServerId,
	onServerIdChange,
	remoteInventory,
	remoteLoading,
	remoteError,
}: SkillsDeployAsideProps) {
	return (
		<aside className="space-y-4">
			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Saved state</p>
				<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
					{skills.length > 0
						? `${skills.length} skill${skills.length === 1 ? "" : "s"} saved`
						: "No skills saved"}
				</h3>
				{skills.length > 0 ? (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
						{enabledCount} enabled, {skills.length - enabledCount} disabled.
						Changes apply on the VPS after deploy.
					</p>
				) : (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
						Add agent skills here, then deploy to your Hermes agent.
					</p>
				)}
			</section>

			<HermesDeployPanel
				deploymentTargets={deploymentTargets}
				description="Deploy your saved skills to the selected Hermes server."
				deployUrl="/api/settings/agent-skills/deploy"
				buttonLabel="Deploy Agent Skills"
				deployingLabel="Deploying..."
				noDeploymentMessage="Install Hermes on a server first to enable agent skills deployment."
				selectedServerId={selectedServerId}
				onServerIdChange={onServerIdChange}
				formatSuccess={(payload: DeployResponsePayload, serverHost: string) => {
					const deployedAt = payload.deployedAt
						? new Date(payload.deployedAt).toLocaleString()
						: null;
					const count = payload.skillCount ?? enabledCount;

					return deployedAt
						? `Deployed ${count} skill${count === 1 ? "" : "s"} to ${serverHost} at ${deployedAt}. Hermes is restarting...`
						: `Deployed ${count} skill${count === 1 ? "" : "s"} to ${serverHost}. Hermes is restarting...`;
				}}
			/>

			{selectedServerId && (
				<section
					className="island-shell rounded-[2rem] p-6 space-y-4"
					id="remote-inventory-section"
				>
					<p className="island-kicker mb-2">Remote Inventory</p>

					{remoteLoading ? (
						<div
							className="flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]"
							id="remote-inventory-loading"
						>
							<LoaderCircle className="h-4 w-4 animate-spin" />
							<span>Fetching remote inventory...</span>
						</div>
					) : remoteError ? (
						<p className="m-0 text-sm text-red-600" id="remote-inventory-error">
							{remoteError}
						</p>
					) : remoteInventory ? (
						<div className="space-y-3" id="remote-inventory-details">
							<h4 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
								{remoteInventory.count} remote skill
								{remoteInventory.count === 1 ? "" : "s"}
							</h4>
							<div className="space-y-1">
								<label
									htmlFor="remote-raw-output"
									className="text-xs font-semibold text-[var(--sea-ink-soft)] uppercase tracking-wider"
								>
									Raw CLI Output
								</label>
								<textarea
									id="remote-raw-output"
									readOnly
									value={remoteInventory.raw}
									rows={6}
									className="w-full rounded-[1rem] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-mono text-[var(--sea-ink)] outline-none resize-none"
								/>
							</div>
						</div>
					) : (
						<p
							className="m-0 text-sm text-[var(--sea-ink-soft)]"
							id="remote-inventory-empty"
						>
							Select a server target to load its remote inventory.
						</p>
					)}

					<p className="m-0 text-xs text-[var(--sea-ink-soft)] italic">
						Note: Only HermesHub-managed skills are changed by Deploy. Remote
						unmanaged skills are not removed.
					</p>
				</section>
			)}
		</aside>
	);
}
