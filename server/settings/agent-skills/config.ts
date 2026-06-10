import type {
	AgentSkillRequest,
	AgentSkillSummary,
	SkillSourceType,
} from "#shared/contracts/agent-skills";
import {
	agentSkillCreateSchema,
	agentSkillUpdateSchema,
	validateCustomContent,
	validateHubInstallRef,
	validateUrlInstallRef,
} from "#shared/contracts/agent-skills";

export {
	AGENT_SKILL_NAME_PATTERN,
	agentSkillCreateSchema,
	agentSkillUpdateSchema,
	getHubInstalledName,
	isValidAgentSkillName,
	normalizeSkillInstallRef,
	resolveManifestName,
	SkillSourceTypeSchema,
} from "#shared/contracts/agent-skills";
export type { AgentSkillRequest, AgentSkillSummary, SkillSourceType };

export function toAgentSkillSummary(record: {
	id: string;
	name: string;
	sourceType: string;
	installRef: string | null;
	content: string | null;
	enabled: boolean;
	createdAt: Date;
	updatedAt: Date;
}): AgentSkillSummary {
	return {
		id: record.id,
		name: record.name,
		sourceType: record.sourceType as SkillSourceType,
		installRef: record.installRef,
		content: record.content,
		enabled: record.enabled,
		createdAt: record.createdAt.toISOString(),
		updatedAt: record.updatedAt.toISOString(),
	};
}

export function parseAgentSkillCreateBody(payload: unknown):
	| {
			ok: true;
			data: Omit<AgentSkillRequest, "id"> & {
				name: string;
				sourceType: SkillSourceType;
			};
	  }
	| { ok: false; error: string } {
	if (!payload || typeof payload !== "object") {
		return { ok: false, error: "Request body must be a JSON object." };
	}

	const parsed = agentSkillCreateSchema.safeParse(payload);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0].message };
	}

	const data = parsed.data;
	return {
		ok: true,
		data: {
			name: data.name,
			sourceType: data.sourceType,
			enabled: data.enabled,
			installRef:
				data.sourceType === "custom"
					? null
					: data.installRef
						? data.installRef.trim()
						: null,
			content:
				data.sourceType === "custom"
					? data.content
						? data.content.trim()
						: null
					: null,
		},
	};
}

export function parseAgentSkillUpdateBody(
	existing: { sourceType: SkillSourceType },
	payload: unknown,
): { ok: true; data: AgentSkillRequest } | { ok: false; error: string } {
	if (!payload || typeof payload !== "object") {
		return { ok: false, error: "Request body must be a JSON object." };
	}

	const parsed = agentSkillUpdateSchema.safeParse(payload);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0].message };
	}

	const data = parsed.data;
	const updates: AgentSkillRequest = {};

	if (data.name !== undefined) updates.name = data.name;
	if (data.enabled !== undefined) updates.enabled = data.enabled;

	if (existing.sourceType === "hub") {
		if (data.installRef !== undefined) {
			const error = validateHubInstallRef(data.installRef ?? "");
			if (error) return { ok: false, error };
			updates.installRef = data.installRef?.trim() ?? null;
		}
	} else if (existing.sourceType === "url") {
		if (data.installRef !== undefined) {
			const error = validateUrlInstallRef(data.installRef ?? "");
			if (error) return { ok: false, error };
			updates.installRef = data.installRef?.trim() ?? null;
		}
	} else if (existing.sourceType === "custom") {
		if (data.content !== undefined) {
			const error = validateCustomContent(data.content);
			if (error) return { ok: false, error };
			updates.content = data.content?.trim() ?? null;
		}
	}

	return { ok: true, data: updates };
}
