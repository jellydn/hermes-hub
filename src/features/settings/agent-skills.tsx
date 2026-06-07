import {
	BookOpen,
	Edit3,
	LoaderCircle,
	Plus,
	Save,
	Trash2,
} from "lucide-react";
import { useReducer, useRef } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import type { HermesDeploymentTarget } from "@/lib/load-hermes-deployment-targets";
import { useMountEffect } from "@/lib/use-mount-effect";
import { cn } from "@/lib/utils";
import {
	type AgentSkillSummary,
	agentSkillCreateSchema,
	type SkillSourceType,
} from "../../../server/settings/agent-skills/config";
import {
	deleteAgentSkill,
	fetchRemoteSkills,
	persistAgentSkill,
} from "./agent-skills-api";
import { HermesDeployPanel } from "./hermes-deploy-panel";

type SkillFormState = {
	name: string;
	sourceType: SkillSourceType;
	installRef: string;
	content: string;
	enabled: boolean;
};

type RemoteInventoryState = {
	raw: string;
	skills: string[];
	count: number;
} | null;

type AgentSkillsState = {
	skills: AgentSkillSummary[];
	isAdding: boolean;
	editingSkill: AgentSkillSummary | null;
	form: SkillFormState;
	isSaving: boolean;
	isDeleting: boolean;
	message: { type: "success" | "error"; text: string } | null;
	selectedServerId: string;
	remoteInventory: RemoteInventoryState;
	remoteLoading: boolean;
	remoteError: string | null;
};

const initialFormState: SkillFormState = {
	name: "",
	sourceType: "hub",
	installRef: "",
	content: "",
	enabled: true,
};

const getInitialState = (
	initialSkills: AgentSkillSummary[],
	initialServerId: string,
): AgentSkillsState => ({
	skills: initialSkills,
	isAdding: false,
	editingSkill: null,
	form: initialFormState,
	isSaving: false,
	isDeleting: false,
	message: null,
	selectedServerId: initialServerId,
	remoteInventory: null,
	remoteLoading: false,
	remoteError: null,
});

function agentSkillsReducer(
	state: AgentSkillsState,
	action:
		| { type: "SET_SKILLS"; skills: AgentSkillSummary[] }
		| { type: "START_ADD" }
		| { type: "START_EDIT"; skill: AgentSkillSummary }
		| { type: "CANCEL_FORM" }
		| {
				[K in keyof SkillFormState]: {
					type: "SET_FORM_FIELD";
					field: K;
					value: SkillFormState[K];
				};
		  }[keyof SkillFormState]
		| { type: "SET_SAVING"; isSaving: boolean }
		| { type: "SET_DELETING"; isDeleting: boolean }
		| {
				type: "SET_MESSAGE";
				message: { type: "success" | "error"; text: string } | null;
		  }
		| { type: "SAVE_SUCCESS"; skill: AgentSkillSummary; message: string }
		| { type: "DELETE_SUCCESS"; skillId: string; message: string }
		| { type: "UPDATE_SKILL"; skill: AgentSkillSummary }
		| { type: "SET_SERVER_ID"; serverId: string }
		| { type: "FETCH_REMOTE_START" }
		| { type: "FETCH_REMOTE_SUCCESS"; inventory: RemoteInventoryState }
		| { type: "FETCH_REMOTE_FAILURE"; error: string },
): AgentSkillsState {
	switch (action.type) {
		case "SET_SKILLS":
			return { ...state, skills: action.skills };
		case "START_ADD":
			return {
				...state,
				isAdding: true,
				editingSkill: null,
				form: initialFormState,
				message: null,
			};
		case "START_EDIT":
			return {
				...state,
				isAdding: false,
				editingSkill: action.skill,
				form: {
					name: action.skill.name,
					sourceType: action.skill.sourceType,
					installRef: action.skill.installRef || "",
					content: action.skill.content || "",
					enabled: action.skill.enabled,
				},
				message: null,
			};
		case "CANCEL_FORM":
			return {
				...state,
				isAdding: false,
				editingSkill: null,
				form: initialFormState,
				message: null,
			};
		case "SET_FORM_FIELD":
			return {
				...state,
				form: { ...state.form, [action.field]: action.value },
			};
		case "SET_SAVING":
			return { ...state, isSaving: action.isSaving };
		case "SET_DELETING":
			return { ...state, isDeleting: action.isDeleting };
		case "SET_MESSAGE":
			return { ...state, message: action.message };
		case "SAVE_SUCCESS": {
			const withoutCurrent = state.skills.filter(
				(s) => s.id !== action.skill.id,
			);
			const sorted = [...withoutCurrent, action.skill].sort((a, b) =>
				a.name.localeCompare(b.name),
			);
			return {
				...state,
				skills: sorted,
				isAdding: false,
				editingSkill: null,
				form: initialFormState,
				message: { type: "success", text: action.message },
			};
		}
		case "DELETE_SUCCESS":
			return {
				...state,
				skills: state.skills.filter((s) => s.id !== action.skillId),
				isAdding:
					state.editingSkill?.id === action.skillId ? false : state.isAdding,
				editingSkill:
					state.editingSkill?.id === action.skillId ? null : state.editingSkill,
				form:
					state.editingSkill?.id === action.skillId
						? initialFormState
						: state.form,
				message: { type: "success", text: action.message },
			};
		case "UPDATE_SKILL":
			return {
				...state,
				skills: state.skills.map((s) =>
					s.id === action.skill.id ? action.skill : s,
				),
			};
		case "SET_SERVER_ID":
			return {
				...state,
				selectedServerId: action.serverId,
				remoteInventory: null,
				remoteError: null,
			};
		case "FETCH_REMOTE_START":
			return { ...state, remoteLoading: true, remoteError: null };
		case "FETCH_REMOTE_SUCCESS":
			return {
				...state,
				remoteLoading: false,
				remoteInventory: action.inventory,
				remoteError: null,
			};
		case "FETCH_REMOTE_FAILURE":
			return {
				...state,
				remoteLoading: false,
				remoteError: action.error,
				remoteInventory: null,
			};
		default:
			return state;
	}
}

type SkillListItemProps = {
	skill: AgentSkillSummary;
	isEditing: boolean;
	isDeleting: boolean;
	onToggleEnabled: (skill: AgentSkillSummary) => void;
	onEdit: (skill: AgentSkillSummary) => void;
	onDelete: (skillId: string) => void;
};

function SkillListItem({
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

type SkillFormProps = {
	form: SkillFormState;
	isEditing: boolean;
	isSaving: boolean;
	onChangeField: <K extends keyof SkillFormState>(
		field: K,
		value: SkillFormState[K],
	) => void;
	onSave: () => void;
	onCancel: () => void;
};

function SkillForm({
	form,
	isEditing,
	isSaving,
	onChangeField,
	onSave,
	onCancel,
}: SkillFormProps) {
	return (
		<section
			className="island-shell rounded-[2rem] p-6 sm:p-8"
			id="skill-form-section"
		>
			<div className="mb-6">
				<p className="island-kicker m-0">
					{isEditing ? "Edit Skill" : "Add Skill"}
				</p>
				<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
					{isEditing ? `Modify ${form.name}` : "Configure New Skill"}
				</h3>
			</div>

			<div className="space-y-4">
				<div className="grid gap-2">
					<label
						htmlFor="skill-name"
						className="text-sm font-medium text-[var(--sea-ink)]"
					>
						Skill name
					</label>
					<input
						id="skill-name"
						type="text"
						value={form.name}
						onChange={(e) => onChangeField("name", e.target.value)}
						className="w-full rounded-[1rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--sea-ink-soft)]"
						placeholder="e.g. web-search"
					/>
					<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
						Must start with a letter and contain only letters, numbers,
						underscores, or hyphens.
					</p>
				</div>

				<div className="grid gap-2">
					<span className="text-sm font-medium text-[var(--sea-ink)]">
						Source type
					</span>
					<div className="flex flex-wrap gap-3">
						{(["hub", "url", "custom"] as const).map((type) => (
							<label
								key={type}
								className={cn(
									"flex items-center gap-2 rounded-[1rem] border px-4 py-2 text-sm font-medium cursor-pointer transition",
									form.sourceType === type
										? "border-[var(--sea-ink-soft)] bg-[var(--sea-ink)]/5 text-[var(--sea-ink)]"
										: "border-[var(--line)] hover:border-[var(--sea-ink-soft)] text-[var(--sea-ink-soft)]",
								)}
							>
								<input
									type="radio"
									name="sourceType"
									value={type}
									checked={form.sourceType === type}
									onChange={() => onChangeField("sourceType", type)}
									className="sr-only"
									disabled={isEditing}
								/>
								<span className="capitalize">
									{type === "hub"
										? "Hub ID"
										: type === "url"
											? "URL"
											: "Custom SKILL.md"}
								</span>
							</label>
						))}
					</div>
					{isEditing && (
						<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
							Source type cannot be changed after creation.
						</p>
					)}
				</div>

				{(form.sourceType === "hub" || form.sourceType === "url") && (
					<div className="grid gap-2">
						<label
							htmlFor="skill-ref"
							className="text-sm font-medium text-[var(--sea-ink)]"
						>
							{form.sourceType === "hub" ? "Hub ID / Ref" : "SKILL.md URL"}
						</label>
						<input
							id="skill-ref"
							type="text"
							value={form.installRef}
							onChange={(e) => onChangeField("installRef", e.target.value)}
							className="w-full rounded-[1rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--sea-ink-soft)]"
							placeholder={
								form.sourceType === "hub"
									? "e.g. autonomous-ai-agents"
									: "e.g. https://raw.githubusercontent.com/user/repo/main/SKILL.md"
							}
						/>
						<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
							{form.sourceType === "hub"
								? "A single-line installer reference string."
								: "Must be a valid http or https URL pointing directly to a SKILL.md file."}
						</p>
					</div>
				)}

				{form.sourceType === "custom" && (
					<div className="grid gap-2">
						<label
							htmlFor="skill-content"
							className="text-sm font-medium text-[var(--sea-ink)]"
						>
							SKILL.md markdown content
						</label>
						<textarea
							id="skill-content"
							value={form.content}
							onChange={(e) => onChangeField("content", e.target.value)}
							rows={10}
							className="w-full rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--sea-ink-soft)] resize-y"
							placeholder="# Custom Skill&#10;&#10;Instructions for the agent..."
						/>
						<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
							Up to 50,000 characters. Markdown is fully supported.
						</p>
					</div>
				)}

				<label className="flex items-center gap-2 text-sm font-medium text-[var(--sea-ink)] cursor-pointer">
					<input
						type="checkbox"
						checked={form.enabled}
						onChange={(e) => onChangeField("enabled", e.target.checked)}
						className="h-4 w-4 rounded border-[var(--line)] text-[var(--sea-ink)] focus:ring-0"
					/>
					<span>Enabled</span>
				</label>
			</div>

			<div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
				<Button type="button" onClick={onSave} disabled={isSaving}>
					{isSaving ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : (
						<Save className="h-4 w-4" />
					)}
					<span>{isSaving ? "Saving..." : "Save Skill"}</span>
				</Button>
				<Button type="button" variant="secondary" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</section>
	);
}

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

function SkillsList({
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

function SkillsDeployAside({
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
				formatSuccess={(payload, serverHost) => {
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

function useAgentSkills(
	initialSkills: AgentSkillSummary[],
	deploymentTargets: HermesDeploymentTarget[],
) {
	const initialServerId = deploymentTargets[0]?.serverId ?? "";
	const [state, dispatch] = useReducer(
		agentSkillsReducer,
		getInitialState(initialSkills, initialServerId),
	);

	const {
		skills,
		isAdding,
		editingSkill,
		form,
		isSaving,
		isDeleting,
		message,
		selectedServerId,
		remoteInventory,
		remoteLoading,
		remoteError,
	} = state;
	const enabledCount = skills.filter((s) => s.enabled).length;

	const generationRef = useRef(0);

	async function loadRemoteInventory(serverId: string) {
		if (!serverId) {
			return;
		}
		const currentGeneration = ++generationRef.current;
		dispatch({ type: "FETCH_REMOTE_START" });
		// react-doctor-disable-next-line react-doctor/async-defer-await
		const result = await fetchRemoteSkills(serverId);
		// Ignore stale responses when server selection changes mid-flight
		if (generationRef.current !== currentGeneration) {
			return;
		}
		if (result.ok) {
			dispatch({ type: "FETCH_REMOTE_SUCCESS", inventory: result.data });
		} else {
			dispatch({ type: "FETCH_REMOTE_FAILURE", error: result.error });
		}
	}

	useMountEffect(() => {
		if (initialServerId) {
			void loadRemoteInventory(initialServerId);
		}
	});

	function handleServerIdChange(serverId: string) {
		dispatch({ type: "SET_SERVER_ID", serverId });
		void loadRemoteInventory(serverId);
	}

	function onChangeField<K extends keyof SkillFormState>(
		field: K,
		value: SkillFormState[K],
	) {
		dispatch({
			type: "SET_FORM_FIELD",
			field,
			value,
		} as unknown as Parameters<typeof dispatch>[0]);
	}

	function handleAddClick() {
		dispatch({ type: "START_ADD" });
	}

	function handleEditClick(skill: AgentSkillSummary) {
		dispatch({ type: "START_EDIT", skill });
	}

	function handleCancel() {
		dispatch({ type: "CANCEL_FORM" });
	}

	async function handleToggleEnabled(skill: AgentSkillSummary) {
		dispatch({ type: "SET_MESSAGE", message: null });
		const updatedEnabled = !skill.enabled;

		const result = await persistAgentSkill({
			method: "PUT",
			url: `/api/settings/agent-skills/${skill.id}`,
			body: { enabled: updatedEnabled },
		});

		if (result.ok) {
			dispatch({ type: "UPDATE_SKILL", skill: result.skill });
		} else {
			dispatch({
				type: "SET_MESSAGE",
				message: {
					type: "error",
					text: result.error,
				},
			});
		}
	}

	async function handleSave() {
		dispatch({ type: "SET_MESSAGE", message: null });

		// Client-side validation using shared Zod schema
		const parsed = agentSkillCreateSchema.safeParse({
			name: form.name,
			sourceType: form.sourceType,
			enabled: form.enabled,
			installRef: form.installRef || undefined,
			content: form.content || undefined,
		});

		if (!parsed.success) {
			dispatch({
				type: "SET_MESSAGE",
				message: {
					type: "error",
					text: parsed.error.issues[0].message,
				},
			});
			return;
		}

		dispatch({ type: "SET_SAVING", isSaving: true });

		const url = editingSkill
			? `/api/settings/agent-skills/${editingSkill.id}`
			: "/api/settings/agent-skills";
		const method = editingSkill ? "PUT" : "POST";

		const body: Record<string, unknown> = {
			name: form.name.trim(),
			sourceType: form.sourceType,
			enabled: form.enabled,
		};

		if (form.sourceType === "hub" || form.sourceType === "url") {
			body.installRef = form.installRef.trim();
		} else {
			body.content = form.content;
		}

		const result = await persistAgentSkill({ method, url, body });

		if (result.ok) {
			dispatch({
				type: "SAVE_SUCCESS",
				skill: result.skill,
				message: "Skill saved. Deploy settings to apply changes.",
			});
		} else {
			dispatch({
				type: "SET_MESSAGE",
				message: {
					type: "error",
					text: result.error,
				},
			});
		}
		dispatch({ type: "SET_SAVING", isSaving: false });
	}

	async function handleDelete(skillId: string) {
		if (!confirm("Are you sure you want to delete this skill?")) {
			return;
		}

		dispatch({ type: "SET_MESSAGE", message: null });
		dispatch({ type: "SET_DELETING", isDeleting: true });

		const result = await deleteAgentSkill(skillId);

		if (result.ok) {
			dispatch({
				type: "DELETE_SUCCESS",
				skillId,
				message: "Skill deleted. Deploy settings to apply changes.",
			});
		} else {
			dispatch({
				type: "SET_MESSAGE",
				message: {
					type: "error",
					text: result.error,
				},
			});
		}
		dispatch({ type: "SET_DELETING", isDeleting: false });
	}

	return {
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
		onChangeField,
		handleAddClick,
		handleEditClick,
		handleCancel,
		handleToggleEnabled,
		handleSave,
		handleDelete,
		handleServerIdChange,
	};
}

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
		onChangeField,
		handleAddClick,
		handleEditClick,
		handleCancel,
		handleToggleEnabled,
		handleSave,
		handleDelete,
		handleServerIdChange,
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

				{/* Add/Edit Form */}
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
					<Banner tone={message.type} className="mt-4">
						{message.text}
					</Banner>
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
			/>
		</div>
	);
}
