import { BookOpen, Edit3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentSkillSummary } from "../../../../../shared/contracts/agent-skills";

type SkillListItemProps = {
	skill: AgentSkillSummary;
	isEditing: boolean;
	isDeleting: boolean;
	onToggleEnabled: (skill: AgentSkillSummary) => void;
	onEdit: (skill: AgentSkillSummary) => void;
	onDelete: (skillId: string) => void;
};

export function SkillListItem({
	skill,
	isEditing,
	isDeleting,
	onToggleEnabled,
	onEdit,
	onDelete,
}: SkillListItemProps) {
	return (
		<li
			className={cn(
				"rounded-[1.25rem] border border-[var(--line)] p-4 transition-all duration-200 hover:shadow-sm",
				isEditing && "border-[var(--sea-ink-soft)] bg-[var(--surface)]",
			)}
		>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex items-start gap-3">
					<div className="mt-1 rounded-lg bg-[var(--sea-ink)]/5 p-2 text-[var(--sea-ink)]">
						<BookOpen className="h-4 w-4" />
					</div>
					<div>
						<p className="m-0 font-semibold text-[var(--sea-ink)]">
							{skill.name}
						</p>
						<p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">
							Type: <span className="capitalize">{skill.sourceType}</span>
							{skill.installRef && ` · Ref: ${skill.installRef}`}
						</p>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<label className="flex items-center gap-2 text-xs font-medium text-[var(--sea-ink-soft)] cursor-pointer">
						<input
							type="checkbox"
							checked={skill.enabled}
							onChange={() => onToggleEnabled(skill)}
							className="h-4 w-4 rounded border-[var(--line)] text-[var(--sea-ink)] focus:ring-0 cursor-pointer"
						/>
						<span>{skill.enabled ? "Enabled" : "Disabled"}</span>
					</label>

					<div className="flex gap-2">
						<Button
							type="button"
							variant="secondary"
							onClick={() => onEdit(skill)}
						>
							<Edit3 className="h-3.5 w-3.5" />
							<span>Edit</span>
						</Button>
						<Button
							type="button"
							variant="secondary"
							onClick={() => onDelete(skill.id)}
							disabled={isDeleting}
						>
							<Trash2 className="h-3.5 w-3.5 text-red-500" />
							<span className="text-red-500">Delete</span>
						</Button>
					</div>
				</div>
			</div>
		</li>
	);
}
