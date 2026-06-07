export type SkillSourceType = "hub" | "url" | "custom";

export type AgentSkillSummary = {
	id: string;
	name: string;
	sourceType: SkillSourceType;
	installRef: string | null;
	content: string | null;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
};

export type AgentSkillRequest = {
	name?: string;
	sourceType?: SkillSourceType;
	installRef?: string | null;
	content?: string | null;
	enabled?: boolean;
};

const AGENT_SKILL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export function isValidAgentSkillName(name: string): boolean {
	return AGENT_SKILL_NAME_PATTERN.test(name);
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

	const body = payload as Record<string, unknown>;

	if (typeof body.name !== "string" || !body.name.trim()) {
		return { ok: false, error: "Skill name is required." };
	}
	const name = body.name.trim();
	if (!isValidAgentSkillName(name)) {
		return {
			ok: false,
			error:
				"Skill name must start with a letter and contain only letters, numbers, underscores, or hyphens.",
		};
	}

	const sourceType = body.sourceType as SkillSourceType;
	if (sourceType !== "hub" && sourceType !== "url" && sourceType !== "custom") {
		return {
			ok: false,
			error: "sourceType must be 'hub', 'url', or 'custom'.",
		};
	}

	const enabled = body.enabled !== false; // defaults to true

	let installRef: string | null = null;
	let content: string | null = null;

	if (sourceType === "hub") {
		if (typeof body.installRef !== "string" || !body.installRef.trim()) {
			return { ok: false, error: "installRef is required for hub skills." };
		}
		const ref = body.installRef.trim();
		if (ref.includes("\n") || ref.includes("\r")) {
			return {
				ok: false,
				error: "installRef for hub skills must be a single-line string.",
			};
		}
		installRef = ref;
	} else if (sourceType === "url") {
		if (typeof body.installRef !== "string" || !body.installRef.trim()) {
			return { ok: false, error: "installRef is required for url skills." };
		}
		const ref = body.installRef.trim();
		try {
			const url = new URL(ref);
			if (url.protocol !== "http:" && url.protocol !== "https:") {
				throw new Error();
			}
		} catch {
			return {
				ok: false,
				error: "installRef for url skills must be a valid http or https URL.",
			};
		}
		installRef = ref;
	} else if (sourceType === "custom") {
		if (typeof body.content !== "string" || !body.content.trim()) {
			return { ok: false, error: "content is required for custom skills." };
		}
		const rawContent = body.content.trim();
		if (rawContent.length > 50000) {
			return {
				ok: false,
				error: "Custom skill content cannot exceed 50,000 characters.",
			};
		}
		content = rawContent;
	}

	return {
		ok: true,
		data: {
			name,
			sourceType,
			installRef,
			content,
			enabled,
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

	const body = payload as Record<string, unknown>;
	const updates: AgentSkillRequest = {};

	if (body.name !== undefined) {
		if (typeof body.name !== "string" || !body.name.trim()) {
			return { ok: false, error: "Skill name cannot be empty." };
		}
		const name = body.name.trim();
		if (!isValidAgentSkillName(name)) {
			return {
				ok: false,
				error:
					"Skill name must start with a letter and contain only letters, numbers, underscores, or hyphens.",
			};
		}
		updates.name = name;
	}

	if (body.enabled !== undefined) {
		if (typeof body.enabled !== "boolean") {
			return { ok: false, error: "enabled must be a boolean." };
		}
		updates.enabled = body.enabled;
	}

	const sourceType = existing.sourceType;

	if (sourceType === "hub") {
		if (body.installRef !== undefined) {
			if (typeof body.installRef !== "string" || !body.installRef.trim()) {
				return { ok: false, error: "installRef is required for hub skills." };
			}
			const ref = body.installRef.trim();
			if (ref.includes("\n") || ref.includes("\r")) {
				return {
					ok: false,
					error: "installRef for hub skills must be a single-line string.",
				};
			}
			updates.installRef = ref;
		}
	} else if (sourceType === "url") {
		if (body.installRef !== undefined) {
			if (typeof body.installRef !== "string" || !body.installRef.trim()) {
				return { ok: false, error: "installRef is required for url skills." };
			}
			const ref = body.installRef.trim();
			try {
				const url = new URL(ref);
				if (url.protocol !== "http:" && url.protocol !== "https:") {
					throw new Error();
				}
			} catch {
				return {
					ok: false,
					error: "installRef for url skills must be a valid http or https URL.",
				};
			}
			updates.installRef = ref;
		}
	} else if (sourceType === "custom") {
		if (body.content !== undefined) {
			if (typeof body.content !== "string" || !body.content.trim()) {
				return { ok: false, error: "content is required for custom skills." };
			}
			const rawContent = body.content.trim();
			if (rawContent.length > 50000) {
				return {
					ok: false,
					error: "Custom skill content cannot exceed 50,000 characters.",
				};
			}
			updates.content = rawContent;
		}
	}

	return {
		ok: true,
		data: updates,
	};
}

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
