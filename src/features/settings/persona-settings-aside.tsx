import type { PersonaSettingsSummary } from "#server/settings/config";
import type { HermesDeploymentTarget } from "@/lib/load-hermes-deployment-targets";
import { HermesDeployPanel } from "./hermes-deploy-panel";

type PersonaSettingsAsideProps = {
	savedSettings: PersonaSettingsSummary | null;
	deploymentTargets: HermesDeploymentTarget[];
	hasSavedPersona: boolean;
};

export function PersonaSettingsAside({
	savedSettings,
	deploymentTargets,
	hasSavedPersona,
}: PersonaSettingsAsideProps) {
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

			<HermesDeployPanel
				deploymentTargets={deploymentTargets}
				description="Push your saved persona to a deployed Hermes agent."
				deployUrl="/api/settings/persona/deploy"
				buttonLabel="Deploy to Hermes Server"
				deployingLabel="Deploying..."
				canDeploy={hasSavedPersona}
				noDeploymentMessage="Install Hermes on a server first to enable persona deployment."
				formatSuccess={(payload, serverHost) => {
					const deployedAt = payload.deployedAt
						? new Date(payload.deployedAt).toLocaleString()
						: null;

					return deployedAt
						? `Persona deployed to ${serverHost} at ${deployedAt}. Hermes is restarting...`
						: `Persona deployed to ${serverHost}. Hermes is restarting...`;
				}}
			/>
		</aside>
	);
}
