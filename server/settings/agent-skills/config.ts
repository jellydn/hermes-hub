import * as z from "zod";

export const SkillSourceTypeSchema = z.enum(["hub", "url", "custom"]);
export type SkillSourceType = z.infer<typeof SkillSourceTypeSchema>;

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

/**
 * For hub sources, the actual installed name is derived from the installRef.
 * The name is the part after the last slash, or the whole thing if no slash.
 * Version specifiers (@version) are stripped.
 */
export function getHubInstalledName(installRef: string): string {
	if (!installRef) return "";

	// Take the part after the last slash
	const withoutPath = installRef.includes("/")
		? (installRef.split("/").pop() ?? installRef)
		: installRef;

	// Strip version specifier
	const withoutVersion = withoutPath.split("@")[0];

	return withoutVersion;
}

/**
 * Resolve the manifest name for a skill.
 * Hub skills use the upstream bundle name (from installRef), not the UI name.
 */
export function resolveManifestName(skill: {
	sourceType: string;
	name: string;
	installRef?: string | null;
}): string {
	if (skill.sourceType === "hub") {
		return getHubInstalledName(skill.installRef ?? "");
	}
	return skill.name;
}

const AGENT_SKILL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export function isValidAgentSkillName(name: string): boolean {
	return AGENT_SKILL_NAME_PATTERN.test(name);
}

const HUB_REF_PATTERN = /^[a-zA-Z0-9_/-]+(?:@[a-zA-Z0-9_.-]+)?$/;

function validateHubInstallRef(ref: string): string | null {
	if (!ref.trim()) return "installRef is required for hub skills.";
	if (!HUB_REF_PATTERN.test(ref)) {
		return "installRef for hub skills must be a valid repository or package reference (e.g., owner/repo or owner/repo@version).";
	}
	return null;
}

function validateUrlInstallRef(ref: string): string | null {
	if (!ref.trim()) return "installRef is required for url skills.";
	try {
		const url = new URL(ref);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new Error();
		}
	} catch {
		return "installRef for url skills must be a valid http or https URL.";
	}
	return null;
}

function validateCustomContent(
	content: string | null | undefined,
): string | null {
	if (!content?.trim()) return "content is required for custom skills.";
	if (content.trim().length > 50000) {
		return "Custom skill content cannot exceed 50,000 characters.";
	}
	return null;
}

export const agentSkillCreateSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, "Skill name is required.")
			.regex(
				AGENT_SKILL_NAME_PATTERN,
				"Skill name must start with a letter and contain only letters, numbers, underscores, or hyphens.",
			),
		sourceType: SkillSourceTypeSchema,
		enabled: z.boolean().default(true),
		installRef: z.string().trim().nullable().optional(),
		content: z.string().trim().nullable().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.sourceType === "hub") {
			const error = validateHubInstallRef(data.installRef ?? "");
			if (error) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["installRef"],
					message: error,
				});
			}
		} else if (data.sourceType === "url") {
			const error = validateUrlInstallRef(data.installRef ?? "");
			if (error) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["installRef"],
					message: error,
				});
			}
		} else if (data.sourceType === "custom") {
			const error = validateCustomContent(data.content);
			if (error) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["content"],
					message: error,
				});
			}
		}
	});

export const agentSkillUpdateSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Skill name cannot be empty.")
		.regex(
			AGENT_SKILL_NAME_PATTERN,
			"Skill name must start with a letter and contain only letters, numbers, underscores, or hyphens.",
		)
		.optional(),
	enabled: z.boolean().optional(),
	installRef: z.string().trim().nullable().optional(),
	content: z.string().trim().nullable().optional(),
});

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

	if (data.name !== undefined) {
		updates.name = data.name;
	}
	if (data.enabled !== undefined) {
		updates.enabled = data.enabled;
	}

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

export function parseRemoteSkillsList(stdout: string): {
	skills: string[];
	count: number;
} {
	const lines = stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const skills: string[] = [];
	if (lines.length === 0) {
		return { skills: [], count: 0 };
	}

	// Detect format type
	const hasListMarker = lines.some((line) => /^[-*•]\s+/.test(line));
	const hasHeader = lines.some((line) => {
		const lower = line.toLowerCase();
		return (
			lower.includes("name") &&
			(lower.includes("source") ||
				lower.includes("status") ||
				lower.includes("enabled") ||
				lower.includes("category"))
		);
	});

	// If it doesn't look like a list or a table, treat as unknown format
	if (!hasListMarker && !hasHeader) {
		return { skills: [], count: 0 };
	}

	const isIgnoredWord = (word: string) => {
		const lower = word.toLowerCase();
		return (
			lower === "name" ||
			lower === "source" ||
			lower === "status" ||
			lower === "enabled" ||
			lower === "disabled" ||
			lower === "installed" ||
			lower === "skills" ||
			lower === "category" ||
			lower === "trust"
		);
	};

	const borderRegex = /[━─═┏┳┓┗┻┛┡┧└┘]/;

	for (const line of lines) {
		// Ignore border/divider lines
		if (borderRegex.test(line)) {
			continue;
		}

		// Check if it has pipe characters (table columns)
		if (line.includes("│") || line.includes("┃")) {
			const parts = line
				.split(/[│┃]/)
				.map((p) => p.trim())
				.filter((p) => p.length > 0);

			if (parts.length >= 1) {
				const firstWord = parts[0];
				if (
					firstWord &&
					/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(firstWord) &&
					!isIgnoredWord(firstWord)
				) {
					if (!skills.includes(firstWord)) {
						skills.push(firstWord);
					}
				}
			}
			continue;
		}

		// Check if bullet point list
		const bulletMatch = line.match(/^[-*•]\s+([a-zA-Z][a-zA-Z0-9_-]*)/);
		if (bulletMatch) {
			const skillName = bulletMatch[1];
			if (
				skillName &&
				!isIgnoredWord(skillName) &&
				!skills.includes(skillName)
			) {
				skills.push(skillName);
			}
			continue;
		}

		// Check if standard space-separated tabular format (e.g. "web-search   hub   enabled")
		const parts = line.split(/\s+/);
		if (parts.length >= 2) {
			const firstWord = parts[0];
			if (
				firstWord &&
				/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(firstWord) &&
				!isIgnoredWord(firstWord)
			) {
				if (!skills.includes(firstWord)) {
					skills.push(firstWord);
				}
			}
		}
	}

	return {
		skills,
		count: skills.length,
	};
}
