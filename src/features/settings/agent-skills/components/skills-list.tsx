import { Plus } from "lucide-react";
import type { AgentSkillSummary } from "#shared/contracts/agent-skills";
import { Button } from "@/components/ui/button";
import { SkillListItem } from "./skill-list-item";

type SkillsListProps = {
	skills: AgentSkillSummary[];
	isAdding: boolean;
	editingSkill: AgentSkillSummary | null;
	isDeleting: boolean;
	onAddClick: () => void;
	onToggleEnabled: (skill: AgentSkillSummary) => void;
	onEditClick: (skill: AgentSkillSummary) => void;
	onDelete: (skillId: string) => void;
};

export function SkillsList({
	skills,
	isAdding,
	editingSkill,
	isDeleting,
	onAddClick,
	onToggleEnabled,
	onEditClick,
	onDelete,
}: SkillsListProps) {
	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
				<div>
					<p className="island-kicker m-0">Managed skills</p>
					<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
						Agent Skills
					</h3>
				</div>
				{!isAdding && !editingSkill && (
					<Button type="button" onClick={onAddClick}>
						<Plus className="h-4 w-4" />
						<span>Add Skill</span>
					</Button>
				)}
			</div>

			{skills.length === 0 ? (
				<p className="m-0 text-sm text-[var(--sea-ink-soft)]">
					No agent skills saved yet. Click "Add Skill" to create one.
				</p>
			) : (
				<ul className="m-0 list-none space-y-3 p-0" id="saved-skills-list">
					{skills.map((skill) => (
						<SkillListItem
							key={skill.id}
							skill={skill}
							isEditing={editingSkill?.id === skill.id}
							isDeleting={isDeleting}
							onToggleEnabled={onToggleEnabled}
							onEdit={onEditClick}
							onDelete={onDelete}
						/>
					))}
				</ul>
			)}
		</section>
	);
}
