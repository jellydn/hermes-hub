import { describe, expect, it } from "vitest";

import {
	classifyManagedSkillStatus,
	countInstalledManagedSkills,
	normalizeSkillInstallRef,
} from "#shared/contracts/agent-skills";

describe("classifyManagedSkillStatus", () => {
	it("separates tracked, drifted, stale, blocked, and missing managed skills", () => {
		expect(
			classifyManagedSkillStatus(
				[
					"tracked-skill",
					"drifted-skill",
					"stale-skill",
					"blocked-skill",
					"missing-skill",
				],
				["tracked-skill", "stale-skill"],
				["blocked-skill"],
				["tracked-skill", "drifted-skill"],
			),
		).toEqual({
			present: ["tracked-skill"],
			drifted: ["drifted-skill"],
			stale: ["stale-skill"],
			blocked: ["blocked-skill"],
			missing: ["missing-skill"],
		});
	});

	it("treats filesystem-installed skills as drifted when manifest is stale", () => {
		const status = classifyManagedSkillStatus(
			["thermo-nuclear-code-quality-review"],
			[],
			[],
			["thermo-nuclear-code-quality-review"],
		);
		expect(status).toEqual({
			present: [],
			drifted: ["thermo-nuclear-code-quality-review"],
			stale: [],
			blocked: [],
			missing: [],
		});
		expect(countInstalledManagedSkills(status)).toBe(1);
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
