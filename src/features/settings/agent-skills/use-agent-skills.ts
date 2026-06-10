import { useRef, useState } from "react";
import type { DeployResponsePayload } from "#/features/settings/hermes-deploy-panel";
import type { HermesDeploymentTarget } from "#/lib/load-hermes-deployment-targets";
import { useMountEffect } from "#/lib/use-mount-effect";
import type {
	AgentSkillSummary,
	ManagedManifestEntry,
} from "#shared/contracts/agent-skills";
import {
	agentSkillCreateSchema,
	agentSkillUpdateSchema,
} from "#shared/contracts/agent-skills";
import {
	deleteAgentSkill,
	fetchRemoteSkills,
	persistAgentSkill,
} from "../agent-skills-api";
import type { SkillFormState } from "./components/skill-form";

const initialFormState: SkillFormState = {
	name: "",
	sourceType: "hub",
	installRef: "",
	content: "",
	enabled: true,
	acceptScannerRisk: false,
};

type RemoteInventoryState = {
	raw: string;
	skills: string[];
	count: number;
	managedManifest: ManagedManifestEntry[];
} | null;

function buildSkillRequestBody(form: SkillFormState): Record<string, unknown> {
	const body: Record<string, unknown> = {
		name: form.name.trim(),
		sourceType: form.sourceType,
		enabled: form.enabled,
	};

	if (form.sourceType === "hub" || form.sourceType === "url") {
		body.installRef = form.installRef.trim();
		body.acceptScannerRisk = form.acceptScannerRisk;
	} else {
		body.content = form.content;
	}

	return body;
}

export function useAgentSkills(
	initialSkills: AgentSkillSummary[],
	deploymentTargets: HermesDeploymentTarget[],
) {
	const initialServerId = deploymentTargets[0]?.serverId ?? "";

	const [skills, setSkills] = useState(initialSkills);
	const [isAdding, setIsAdding] = useState(false);
	const [editingSkill, setEditingSkill] = useState<AgentSkillSummary | null>(
		null,
	);
	const [form, setForm] = useState<SkillFormState>(initialFormState);
	const [isSaving, setIsSaving] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [message, setMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);
	const [selectedServerId, setSelectedServerId] = useState(initialServerId);
	const [remoteInventory, setRemoteInventory] =
		useState<RemoteInventoryState>(null);
	const [remoteLoading, setRemoteLoading] = useState(false);
	const [remoteError, setRemoteError] = useState<string | null>(null);
	const [lastBlockedSkills, setLastBlockedSkills] = useState<string[]>([]);

	const enabledCount = skills.filter((s) => s.enabled).length;
	const generationRef = useRef(0);

	function clearMessage() {
		setMessage(null);
	}

	function onChangeField<K extends keyof SkillFormState>(
		field: K,
		value: SkillFormState[K],
	) {
		setForm((prev) => ({ ...prev, [field]: value }));
	}

	function handleAddClick() {
		setIsAdding(true);
		setEditingSkill(null);
		setForm(initialFormState);
		clearMessage();
	}

	function handleEditClick(skill: AgentSkillSummary) {
		setIsAdding(false);
		setEditingSkill(skill);
		setForm({
			name: skill.name,
			sourceType: skill.sourceType,
			installRef: skill.installRef || "",
			content: skill.content || "",
			enabled: skill.enabled,
			acceptScannerRisk: skill.acceptScannerRisk,
		});
		clearMessage();
	}

	function handleCancel() {
		setIsAdding(false);
		setEditingSkill(null);
		setForm(initialFormState);
		clearMessage();
	}

	async function loadRemoteInventory(serverId: string) {
		if (!serverId) return;
		const currentGeneration = ++generationRef.current;
		setRemoteLoading(true);
		setRemoteError(null);
		const result = await fetchRemoteSkills(serverId);
		// Ignore stale responses when server selection changes mid-flight
		if (generationRef.current !== currentGeneration) return;
		if (result.ok) {
			setRemoteInventory(result.data);
		} else {
			setRemoteError(result.error);
			setRemoteInventory(null);
		}
		setRemoteLoading(false);
	}

	useMountEffect(() => {
		if (initialServerId) {
			void loadRemoteInventory(initialServerId);
		}
	});

	function handleServerIdChange(serverId: string) {
		setSelectedServerId(serverId);
		setRemoteInventory(null);
		setRemoteError(null);
		void loadRemoteInventory(serverId);
	}

	async function handleToggleEnabled(skill: AgentSkillSummary) {
		clearMessage();
		const result = await persistAgentSkill({
			method: "PUT",
			url: `/api/settings/agent-skills/${skill.id}`,
			body: { enabled: !skill.enabled },
		});
		if (result.ok) {
			setSkills((prev) =>
				prev.map((s) => (s.id === result.skill.id ? result.skill : s)),
			);
		} else {
			setMessage({ type: "error", text: result.error });
		}
	}

	async function handleSave() {
		clearMessage();

		if (editingSkill) {
			const parsed = agentSkillUpdateSchema.safeParse({
				name: form.name,
				enabled: form.enabled,
				installRef:
					form.sourceType === "hub" || form.sourceType === "url"
						? form.installRef
						: undefined,
				content: form.sourceType === "custom" ? form.content : undefined,
			});

			if (!parsed.success) {
				setMessage({
					type: "error",
					text: parsed.error.issues[0].message,
				});
				return;
			}
		} else {
			const parsed = agentSkillCreateSchema.safeParse({
				name: form.name,
				sourceType: form.sourceType,
				enabled: form.enabled,
				installRef: form.installRef || undefined,
				content: form.content || undefined,
			});

			if (!parsed.success) {
				setMessage({
					type: "error",
					text: parsed.error.issues[0].message,
				});
				return;
			}
		}

		setIsSaving(true);

		const url = editingSkill
			? `/api/settings/agent-skills/${editingSkill.id}`
			: "/api/settings/agent-skills";
		const method = editingSkill ? "PUT" : "POST";

		const body = buildSkillRequestBody(form);
		const result = await persistAgentSkill({ method, url, body });

		if (result.ok) {
			setSkills((prev) => {
				const withoutCurrent = prev.filter((s) => s.id !== result.skill.id);
				return [...withoutCurrent, result.skill].sort((a, b) =>
					a.name.localeCompare(b.name),
				);
			});
			setIsAdding(false);
			setEditingSkill(null);
			setForm(initialFormState);
			setMessage({
				type: "success",
				text: "Skill saved. Deploy settings to apply changes.",
			});
		} else {
			setMessage({ type: "error", text: result.error });
		}
		setIsSaving(false);
	}

	async function handleDelete(skillId: string) {
		if (!confirm("Are you sure you want to delete this skill?")) return;

		clearMessage();
		setIsDeleting(true);
		const result = await deleteAgentSkill(skillId);

		if (result.ok) {
			setSkills((prev) => prev.filter((s) => s.id !== skillId));
			if (editingSkill?.id === skillId) {
				setEditingSkill(null);
				setIsAdding(false);
				setForm(initialFormState);
			}
			setMessage({
				type: "success",
				text: "Skill deleted. Deploy settings to apply changes.",
			});
		} else {
			setMessage({ type: "error", text: result.error });
		}
		setIsDeleting(false);
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
		lastBlockedSkills,
		onChangeField,
		handleAddClick,
		handleEditClick,
		handleCancel,
		handleToggleEnabled,
		handleSave,
		handleDelete,
		handleServerIdChange,
		onDeploySuccess: (payload: DeployResponsePayload) => {
			setLastBlockedSkills(payload.blockedSkills ?? []);
			if (selectedServerId) void loadRemoteInventory(selectedServerId);
		},
	};
}
