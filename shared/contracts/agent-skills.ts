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
	acceptScannerRisk: boolean;
	createdAt: string;
	updatedAt: string;
};

export type AgentSkillRequest = {
	name?: string;
	sourceType?: SkillSourceType;
	installRef?: string | null;
	content?: string | null;
	enabled?: boolean;
	acceptScannerRisk?: boolean;
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

type GithubSkillPath = {
	owner: string;
	repo: string;
	/** null uses the repository default branch (HEAD) for raw fetches. */
	gitRef: string | null;
	pathParts: string[];
};

function stripSkillMdFileName(pathParts: string[]): string[] {
	const parts = [...pathParts];
	if (parts.at(-1) === "SKILL.md") {
		parts.pop();
	}
	return parts;
}

function parseGithubWebUrl(url: URL): GithubSkillPath | null {
	const segments = url.pathname.split("/").filter(Boolean);
	if (segments.length < 2) {
		return null;
	}

	const [owner, repo, marker, gitRef, ...rest] = segments;
	if (!owner || !repo) {
		return null;
	}

	if (marker !== "tree" && marker !== "blob") {
		return {
			owner,
			repo,
			gitRef: null,
			pathParts: stripSkillMdFileName(segments.slice(2)),
		};
	}

	if (!gitRef) {
		return null;
	}

	return {
		owner,
		repo,
		gitRef,
		pathParts: stripSkillMdFileName([...rest]),
	};
}

function parseGithubSlug(slug: string): GithubSkillPath | null {
	const segments = slug.split("/").filter(Boolean);
	if (segments.length < 2) {
		return null;
	}

	const [owner, repo, ...rest] = segments;
	if (!owner || !repo) {
		return null;
	}

	return {
		owner,
		repo,
		gitRef: null,
		pathParts: stripSkillMdFileName([...rest]),
	};
}

function githubSkillPathToSlug(path: GithubSkillPath): string {
	return [path.owner, path.repo, ...path.pathParts].join("/");
}

function githubSkillPathToRawSkillMdUrl(path: GithubSkillPath): string {
	const ref = path.gitRef ?? "HEAD";
	const skillPath = path.pathParts.join("/");
	const suffix = skillPath ? `/${skillPath}/SKILL.md` : "/SKILL.md";
	return `https://raw.githubusercontent.com/${path.owner}/${path.repo}/${ref}${suffix}`;
}

function isOpaqueHubRegistryRef(ref: string): boolean {
	return ref.startsWith("skills-sh/") || ref.startsWith("browse-sh/");
}

/**
 * Rewrite a skill install reference into the form the Hermes CLI understands.
 *
 * `hermes skills install` installs a *single* `SKILL.md` when given a raw
 * `*.md` URL (e.g. `raw.githubusercontent.com/.../SKILL.md`), but installs the
 * *whole skill folder* (SKILL.md plus scripts and any other files) when given
 * an `owner/repo/path` slug routed through its GitHub source.
 *
 * GitHub's own folder/file URLs are not understood by the CLI directly, so we
 * rewrite them to the slug form here:
 *   - `github.com/owner/repo/tree/<ref>/<path>`            → `owner/repo/<path>`
 *   - `github.com/owner/repo/blob/<ref>/<path>/SKILL.md`   → `owner/repo/<path>`
 *   - `github.com/owner/repo/blob/<ref>/<path>`            → `owner/repo/<path>`
 *   - `github.com/owner/repo`                              → `owner/repo`
 *
 * A trailing `/SKILL.md` is stripped so the parent folder is installed. The
 * branch/ref in the URL is dropped because the slug form always resolves the
 * repository's default branch.
 *
 * Raw `*.md` URLs (and refs that are already slugs) are returned unchanged so
 * single-file installs keep working.
 */
export function normalizeSkillInstallRef(ref: string): string {
	const trimmed = ref.trim();
	if (!trimmed) return trimmed;

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return trimmed; // already a slug or non-URL ref
	}

	const host = url.hostname.replace(/^www\./, "");
	if (host !== "github.com") {
		return trimmed; // raw.githubusercontent.com and other hosts: leave as-is
	}

	const parsed = parseGithubWebUrl(url);
	if (!parsed) {
		return trimmed;
	}

	return githubSkillPathToSlug(parsed);
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
		acceptScannerRisk: z.boolean().default(false),
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
	acceptScannerRisk: z.boolean().optional(),
	installRef: z.string().trim().nullable().optional(),
	content: z.string().trim().nullable().optional(),
});

/**
 * The trailing random-id suffix on browse.sh refs is always exactly 6
 * lowercase alphanumeric chars: `-[a-z0-9]{6}$`.  Hermes strips it from
 * the installed skill name.
 *
 * Examples:
 *   `browse-sh/weather.gov/get-forecast-1uezib`  →  `get-forecast`
 *   `browse-sh/windy.com/geo-weather-fetch-w3o49h`  →  `geo-weather-fetch`
 *
 * We only apply this stripping when the ref starts with `browse-sh/` so
 * that non-browse refs like `web-search` or `hermes-web-search` are not
 * accidentally truncated.
 */
const BROWSE_SH_ID_SUFFIX = /-[a-z0-9]{6}$/;

export function isSkillsShInstallRef(installRef: string): boolean {
	return installRef.startsWith("skills-sh/");
}

/**
 * Derive the Hermes skill name that will actually be installed on the
 * remote host.
 *
 * For browse.sh refs (`browse-sh/<host>/<slug>-<id>`) Hermes strips the
 * random-id suffix, so we strip it too.
 *
 * For all other hub refs we return the last path segment, minus any
 * `@version` suffix — the same rule Hermes applies.
 *
 * Returns `""` for an empty ref.
 */
export function getHubInstalledName(installRef: string): string {
	if (!installRef) return "";
	const last = (installRef.split("/").pop() ?? installRef).split("@")[0];
	if (installRef.startsWith("browse-sh/")) {
		return last.replace(BROWSE_SH_ID_SUFFIX, "");
	}
	if (isSkillsShInstallRef(installRef)) {
		// skills.sh registry IDs omit hyphens (e.g. last-30-days -> last30days).
		return last.replace(/-/g, "");
	}
	return last;
}

/** Alternate on-disk names Hermes may use for the same hub ref. */
export function getInstalledNameAliases(manifestName: string): string[] {
	const aliases = new Set<string>([manifestName]);
	if (manifestName.includes("-")) {
		aliases.add(manifestName.replace(/-/g, ""));
	}
	return [...aliases];
}

export function isSkillInstalledOnRemote(
	manifestName: string,
	installedSkillNames: Iterable<string>,
): boolean {
	const installed = new Set(installedSkillNames);
	for (const alias of getInstalledNameAliases(manifestName)) {
		if (installed.has(alias)) {
			return true;
		}
	}
	return false;
}

/**
 * Best-effort URL for fetching a single SKILL.md when bypassing the Hermes
 * scanner via direct file write. Returns null when no safe URL can be derived.
 */
export function deriveSkillMdFetchUrl(
	installRef: string,
	sourceType: SkillSourceType,
): string | null {
	const raw = installRef.trim();
	if (!raw) {
		return null;
	}

	if (raw.startsWith("http://") || raw.startsWith("https://")) {
		try {
			const url = new URL(raw);
			if (url.protocol !== "http:" && url.protocol !== "https:") {
				return null;
			}
			const host = url.hostname.replace(/^www\./, "");
			if (host === "github.com") {
				const parsed = parseGithubWebUrl(url);
				return parsed ? githubSkillPathToRawSkillMdUrl(parsed) : null;
			}
			return raw;
		} catch {
			return null;
		}
	}

	if (sourceType !== "hub") {
		return null;
	}

	const trimmed = normalizeSkillInstallRef(raw);
	if (isOpaqueHubRegistryRef(trimmed)) {
		return null;
	}

	const parsed = parseGithubSlug(trimmed);
	return parsed ? githubSkillPathToRawSkillMdUrl(parsed) : null;
}

export function canDeriveScannerBypassUrl(
	installRef: string,
	sourceType: SkillSourceType,
): boolean {
	return deriveSkillMdFetchUrl(installRef, sourceType) !== null;
}

export function getScannerBypassUnavailableReason(
	installRef: string,
	sourceType: SkillSourceType,
): string | null {
	if (sourceType === "custom") {
		return null;
	}

	if (!installRef.trim()) {
		return "Install reference is required for scanner bypass.";
	}

	if (canDeriveScannerBypassUrl(installRef, sourceType)) {
		return null;
	}

	const trimmed = installRef.trim();
	if (
		isOpaqueHubRegistryRef(trimmed) ||
		isOpaqueHubRegistryRef(normalizeSkillInstallRef(trimmed))
	) {
		return "Scanner bypass is not available for skills.sh or browse.sh registry refs. Use a GitHub URL or direct raw SKILL.md link.";
	}

	return "Scanner bypass needs a fetchable SKILL.md URL (GitHub folder/file URL or direct raw link).";
}

/** Resolve the manifest name for a skill.
 *
 * For hub skills: Hermes CLI derives the installed name from the ref
 * (last path segment before any @version), so the manifest uses that
 * derived name to match the real installed directory.
 *
 * For URL skills: we pass a `--name` flag, so the installed name matches
 * the saved `name`. Custom skills are written with the saved `name` as
 * the directory name.
 *
 * The manifest, remote-inventory comparison, and uninstall commands all
 * use this resolved name.
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

export type ManagedManifestEntry = {
	name: string;
	sourceType: string;
	installRef?: string;
};

/** Hermes CLI category folder for skills deployed from HermesHub settings. */
export const HERMES_HUB_SKILL_CATEGORY = "hermeshub";

export type RemoteSkillsInventory = {
	raw: string;
	managedManifest: ManagedManifestEntry[];
	installedSkillNames: string[];
};

/** HermesHub-managed skill presence is determined by the remote manifest only. */
export function isManagedSkillInManifest(
	expectedName: string,
	managedManifestNames: Iterable<string>,
): boolean {
	for (const manifestName of managedManifestNames) {
		if (manifestName === expectedName) {
			return true;
		}
	}
	return false;
}

export type ManagedSkillStatus = {
	present: string[];
	blocked: string[];
	missing: string[];
};

export function classifyManagedSkillStatus(
	expectedNames: string[],
	managedManifestNames: Iterable<string>,
	lastBlockedSkills: Iterable<string>,
): ManagedSkillStatus {
	const manifestSet = new Set(managedManifestNames);
	const blockedSet = new Set(lastBlockedSkills);
	const present: string[] = [];
	const blocked: string[] = [];
	const missing: string[] = [];

	for (const name of expectedNames) {
		if (manifestSet.has(name)) {
			present.push(name);
		} else if (blockedSet.has(name)) {
			blocked.push(name);
		} else {
			missing.push(name);
		}
	}

	return { present, blocked, missing };
}
