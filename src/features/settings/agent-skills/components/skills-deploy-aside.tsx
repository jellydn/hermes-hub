import { LoaderCircle, TriangleAlert } from "lucide-react";
import type { DeployResponsePayload } from "#/features/settings/hermes-deploy-panel";
import { HermesDeployPanel } from "#/features/settings/hermes-deploy-panel";
import type { HermesDeploymentTarget } from "#/lib/load-hermes-deployment-targets";
import type {
	AgentSkillSummary,
	ManagedManifestEntry,
} from "#shared/contracts/agent-skills";
import {
	classifyManagedSkillStatus,
	resolveManifestName,
} from "#shared/contracts/agent-skills";

type RemoteInventoryState = {
	raw: string;
	skills: string[];
	count: number;
	managedManifest: ManagedManifestEntry[];
} | null;

function getEnabledManifestNames(skills: AgentSkillSummary[]): string[] {
	const names: string[] = [];
	for (const skill of skills) {
		if (skill.enabled) {
			names.push(resolveManifestName(skill));
		}
	}
	return names;
}

function formatDeploySuccess(
	payload: DeployResponsePayload,
	serverHost: string,
	enabledCount: number,
): string {
	const deployedAt = payload.deployedAt
		? new Date(payload.deployedAt).toLocaleString()
		: null;
	const count = payload.skillCount ?? enabledCount;
	const blocked = payload.blockedSkills;

	const base = deployedAt
		? `Deployed ${count} skill${
				count === 1 ? "" : "s"
			} to ${serverHost} at ${deployedAt}. Hermes is restarting...`
		: `Deployed ${count} skill${
				count === 1 ? "" : "s"
			} to ${serverHost}. Hermes is restarting...`;

	if (blocked && blocked.length > 0) {
		return `${base} ${blocked.length} skill${
			blocked.length === 1 ? " was" : "s were"
		} blocked by the Hermes scanner: ${blocked.join(", ")}. Redeploy will not override a dangerous scanner verdict — disable the skill in Hub or install it manually on the server if you accept the risk.`;
	}

	return base;
}

type SkillsDeployAsideProps = {
	skills: AgentSkillSummary[];
	enabledCount: number;
	deploymentTargets: HermesDeploymentTarget[];
	selectedServerId: string;
	onServerIdChange: (serverId: string) => void;
	remoteInventory: RemoteInventoryState;
	remoteLoading: boolean;
	remoteError: string | null;
	lastBlockedSkills: string[];
	onDeploySuccess: (payload: DeployResponsePayload) => void;
};

function ManagedSkillSummary({
	expectedNames,
	managedManifestNames,
	lastBlockedSkills,
}: {
	expectedNames: string[];
	managedManifestNames: string[];
	lastBlockedSkills: string[];
}) {
	const { present, blocked, missing } = classifyManagedSkillStatus(
		expectedNames,
		managedManifestNames,
		lastBlockedSkills,
	);

	return (
		<div
			className="space-y-2 rounded-[1rem] border border-[var(--line)] bg-[var(--surface)] p-3"
			id="managed-skill-summary"
		>
			<span className="text-xs font-semibold text-[var(--sea-ink-soft)] uppercase tracking-wider">
				Managed Skill Status
			</span>
			<p className="m-0 text-sm text-[var(--sea-ink)]">
				{present.length} of {expectedNames.length} enabled skill
				{expectedNames.length === 1 ? "" : "s"} present on remote
			</p>
			{blocked.length > 0 && (
				<div
					className="flex items-start gap-1.5 text-sm text-amber-600"
					id="blocked-managed-skills"
				>
					<TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
					<span>
						Blocked by Hermes scanner on last deploy:
						{blocked.map((n) => ` ${n}`)}. Redeploy will not install these until
						the scanner allows them.
					</span>
				</div>
			)}
			{missing.length > 0 && (
				<div
					className="flex items-start gap-1.5 text-sm text-amber-600"
					id="missing-managed-skills"
				>
					<TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
					<span>
						Not in Hub manifest on remote:
						{missing.map((n) => ` ${n}`)}. Deploy again to sync, or check the
						raw CLI output for the full remote inventory.
					</span>
				</div>
			)}
		</div>
	);
}

export function SkillsDeployAside({
	skills,
	enabledCount,
	deploymentTargets,
	selectedServerId,
	onServerIdChange,
	remoteInventory,
	remoteLoading,
	remoteError,
	lastBlockedSkills,
	onDeploySuccess,
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
				onDeploySuccess={onDeploySuccess}
				formatSuccess={(payload, host) =>
					formatDeploySuccess(payload, host, enabledCount)
				}
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

							{skills.length > 0 && (
								<ManagedSkillSummary
									expectedNames={getEnabledManifestNames(skills)}
									managedManifestNames={remoteInventory.managedManifest.map(
										(entry) => entry.name,
									)}
									lastBlockedSkills={lastBlockedSkills}
								/>
							)}

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
