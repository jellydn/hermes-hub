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

const AGENT_SKILL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export function isValidAgentSkillName(name: string): boolean {
	return AGENT_SKILL_NAME_PATTERN.test(name);
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
			if (!data.installRef?.trim()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["installRef"],
					message: "installRef is required for hub skills.",
				});
			} else {
				const ref = data.installRef.trim();
				if (ref.includes("\n") || ref.includes("\r")) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["installRef"],
						message: "installRef for hub skills must be a single-line string.",
					});
				}
			}
		} else if (data.sourceType === "url") {
			if (!data.installRef?.trim()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["installRef"],
					message: "installRef is required for url skills.",
				});
			} else {
				const ref = data.installRef.trim();
				try {
					const url = new URL(ref);
					if (url.protocol !== "http:" && url.protocol !== "https:") {
						throw new Error();
					}
				} catch {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["installRef"],
						message:
							"installRef for url skills must be a valid http or https URL.",
					});
				}
			}
		} else if (data.sourceType === "custom") {
			if (!data.content?.trim()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["content"],
					message: "content is required for custom skills.",
				});
			} else {
				const rawContent = data.content.trim();
				if (rawContent.length > 50000) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["content"],
						message: "Custom skill content cannot exceed 50,000 characters.",
					});
				}
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
			if (data.installRef === null || !data.installRef.trim()) {
				return { ok: false, error: "installRef is required for hub skills." };
			}
			const ref = data.installRef.trim();
			if (ref.includes("\n") || ref.includes("\r")) {
				return {
					ok: false,
					error: "installRef for hub skills must be a single-line string.",
				};
			}
			updates.installRef = ref;
		}
	} else if (existing.sourceType === "url") {
		if (data.installRef !== undefined) {
			if (data.installRef === null || !data.installRef.trim()) {
				return { ok: false, error: "installRef is required for url skills." };
			}
			const ref = data.installRef.trim();
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
	} else if (existing.sourceType === "custom") {
		if (data.content !== undefined) {
			if (data.content === null || !data.content.trim()) {
				return { ok: false, error: "content is required for custom skills." };
			}
			const rawContent = data.content.trim();
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
