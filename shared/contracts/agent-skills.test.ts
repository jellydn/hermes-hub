import { describe, expect, it } from "vitest";

import {
	canDeriveScannerBypassUrl,
	classifyManagedSkillStatus,
	deriveSkillMdFetchUrl,
	getHubInstalledName,
	getScannerBypassUnavailableReason,
	isManagedSkillInManifest,
	isSkillInstalledOnRemote,
	normalizeSkillInstallRef,
} from "#shared/contracts/agent-skills";

describe("isManagedSkillInManifest", () => {
	it("matches managed skills by exact manifest name", () => {
		expect(
			isManagedSkillInManifest("thermo-nuclear-code-quality-review", [
				"thermo-nuclear-code-quality-review",
			]),
		).toBe(true);
	});

	it("does not match truncated CLI prefixes", () => {
		expect(
			isManagedSkillInManifest("thermo-nuclear-code-quality-review", [
				"thermo-nuclear-cod",
			]),
		).toBe(false);
	});
});

describe("classifyManagedSkillStatus", () => {
	it("separates present, blocked, and missing managed skills", () => {
		expect(
			classifyManagedSkillStatus(
				["present-skill", "blocked-skill", "missing-skill"],
				["present-skill"],
				["blocked-skill"],
			),
		).toEqual({
			present: ["present-skill"],
			blocked: ["blocked-skill"],
			missing: ["missing-skill"],
		});
	});
});

describe("getHubInstalledName", () => {
	it("maps skills.sh hyphenated slugs to Hermes directory names", () => {
		expect(getHubInstalledName("skills-sh/example.com/last-30-days")).toBe(
			"last30days",
		);
	});
});

describe("isSkillInstalledOnRemote", () => {
	it("matches hyphen-stripped installed directory aliases", () => {
		expect(isSkillInstalledOnRemote("last-30-days", ["last30days"])).toBe(true);
	});
});

describe("deriveSkillMdFetchUrl", () => {
	it("rewrites GitHub folder URLs for url skills into raw SKILL.md links", () => {
		expect(
			deriveSkillMdFetchUrl(
				"https://github.com/owner/repo/tree/main/skills/pr-review",
				"url",
			),
		).toBe(
			"https://raw.githubusercontent.com/owner/repo/main/skills/pr-review/SKILL.md",
		);
	});

	it("returns direct raw SKILL.md URLs unchanged", () => {
		const raw =
			"https://raw.githubusercontent.com/owner/repo/main/skills/pr-review/SKILL.md";
		expect(deriveSkillMdFetchUrl(raw, "url")).toBe(raw);
	});

	it("returns null for opaque skills.sh hub refs", () => {
		expect(
			deriveSkillMdFetchUrl("skills-sh/example.com/pr-review", "hub"),
		).toBeNull();
	});

	it("reports when scanner bypass cannot be derived", () => {
		expect(
			canDeriveScannerBypassUrl("skills-sh/example.com/pr-review", "hub"),
		).toBe(false);
		expect(
			getScannerBypassUnavailableReason(
				"skills-sh/example.com/pr-review",
				"hub",
			),
		).toContain("skills.sh");
	});
});

describe("normalizeSkillInstallRef", () => {
	it("rewrites a GitHub tree (folder) URL to an owner/repo/path slug", () => {
		expect(
			normalizeSkillInstallRef(
				"https://github.com/mattpocock/skills/tree/main/skills/productivity/teach",
			),
		).toBe("mattpocock/skills/skills/productivity/teach");
	});

	it("rewrites a GitHub blob URL pointing at SKILL.md to the parent folder slug", () => {
		expect(
			normalizeSkillInstallRef(
				"https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md",
			),
		).toBe("mattpocock/skills/skills/productivity/teach");
	});

	it("rewrites a GitHub blob URL pointing at a folder to a slug", () => {
		expect(
			normalizeSkillInstallRef(
				"https://github.com/owner/repo/blob/develop/path/to/skill",
			),
		).toBe("owner/repo/path/to/skill");
	});

	it("rewrites a bare github.com repo URL to owner/repo", () => {
		expect(normalizeSkillInstallRef("https://github.com/owner/repo")).toBe(
			"owner/repo",
		);
	});

	it("leaves a raw SKILL.md URL unchanged (single-file install)", () => {
		const raw =
			"https://raw.githubusercontent.com/user/repo/main/skills/foo/SKILL.md";
		expect(normalizeSkillInstallRef(raw)).toBe(raw);
	});

	it("leaves an existing owner/repo/path slug unchanged", () => {
		expect(normalizeSkillInstallRef("owner/repo/path")).toBe("owner/repo/path");
	});
});
