import { AlertPanel } from "#/components/ui/alert-panel";
import type { HermesDeploymentTarget } from "#/lib/load-hermes-deployment-targets";
import type { AgentSkillSummary } from "#shared/contracts/agent-skills";
import { SkillForm } from "./agent-skills/components/skill-form";
import { SkillsDeployAside } from "./agent-skills/components/skills-deploy-aside";
import { SkillsList } from "./agent-skills/components/skills-list";
import { useAgentSkills } from "./agent-skills/use-agent-skills";

type AgentSkillsProps = {
	initialSkills: AgentSkillSummary[];
	deploymentTargets: HermesDeploymentTarget[];
};

export function AgentSkills({
	initialSkills,
	deploymentTargets,
}: AgentSkillsProps) {
	const {
		skills,
		isAdding,
		editingSkill,
		form,
		isSaving,
		isDeleting,
		message,
		enabledCount,
		selectedServerId,
		remoteInventory,
		remoteLoading,
		remoteError,
		lastBlockedSkills,
		lastBypassUnavailableSkills,
		onChangeField,
		handleAddClick,
		handleEditClick,
		handleCancel,
		handleToggleEnabled,
		handleSave,
		handleDelete,
		handleServerIdChange,
		onDeploySuccess,
	} = useAgentSkills(initialSkills, deploymentTargets);

	return (
		<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
			<div className="space-y-4">
				<SkillsList
					skills={skills}
					isAdding={isAdding}
					editingSkill={editingSkill}
					isDeleting={isDeleting}
					onAddClick={handleAddClick}
					onToggleEnabled={handleToggleEnabled}
					onEditClick={handleEditClick}
					onDelete={handleDelete}
				/>

				{(isAdding || editingSkill) && (
					<SkillForm
						form={form}
						isEditing={Boolean(editingSkill)}
						isSaving={isSaving}
						onChangeField={onChangeField}
						onSave={handleSave}
						onCancel={handleCancel}
					/>
				)}

				{message && (
					<AlertPanel tone={message.type} withStatusIcon className="mt-4">
						{message.text}
					</AlertPanel>
				)}
			</div>

			<SkillsDeployAside
				skills={skills}
				enabledCount={enabledCount}
				deploymentTargets={deploymentTargets}
				selectedServerId={selectedServerId}
				onServerIdChange={handleServerIdChange}
				remoteInventory={remoteInventory}
				remoteLoading={remoteLoading}
				remoteError={remoteError}
				lastBlockedSkills={lastBlockedSkills}
				lastBypassUnavailableSkills={lastBypassUnavailableSkills}
				onDeploySuccess={onDeploySuccess}
			/>
		</div>
	);
}
