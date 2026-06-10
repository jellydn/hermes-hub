import { describe, expect, it } from "vitest";

import { normalizeSkillInstallRef } from "#shared/contracts/agent-skills";

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
