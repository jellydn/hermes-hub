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

export const AGENT_SKILL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export function isValidAgentSkillName(name: string): boolean {
	return AGENT_SKILL_NAME_PATTERN.test(name);
}

export const HUB_REF_PATTERN = /^[a-zA-Z0-9_./-]+(?:@[a-zA-Z0-9_.-]+)?$/;

export function validateHubInstallRef(ref: string): string | null {
	if (!ref.trim()) return "installRef is required for hub skills.";
	if (!HUB_REF_PATTERN.test(ref)) {
		return "installRef for hub skills must be a valid repository or package reference (e.g., owner/repo or owner/repo@version).";
	}
	return null;
}

export function validateUrlInstallRef(ref: string): string | null {
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

export function validateCustomContent(
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
			// Ensure the derived Hub installed name is a valid manifest name
			const derivedName = getHubInstalledName(data.installRef ?? "");
			if (derivedName && !isValidAgentSkillName(derivedName)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["installRef"],
					message: `Hub install ref produces an invalid skill name '${derivedName}'. The last path segment must start with a letter and contain only letters, numbers, underscores, or hyphens.`,
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

/**
 * Derive the Hermes skill name from a hub installRef: the segment after
 * the last slash (or the whole string if there's no slash), minus any
 * @version suffix.
 */
export function getHubInstalledName(installRef: string): string {
	if (!installRef) return "";
	return (installRef.split("/").pop() ?? installRef).split("@")[0];
}

/** Resolve the manifest name for a skill.
 *
 * Hub skills are installed without `--name`, so Hermes derives the installed
 * name from the installRef. We must use that derived name in the manifest,
 * remote-inventory comparison, and uninstall commands so they match what is
 * actually installed.
 *
 * URL and custom skills use the saved `name` because we pass `--name` or
 * write the file directly.
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
