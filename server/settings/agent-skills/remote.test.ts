import { describe, expect, it } from "vitest";

import { buildDirectSkillInstallCommand } from "./remote";

describe("buildDirectSkillInstallCommand", () => {
	it("uses temp-file download instead of pipe", () => {
		const cmd = buildDirectSkillInstallCommand(
			"my-skill",
			"https://example.com/skill.md",
		);

		expect(cmd).not.toContain("|");
		expect(cmd).not.toContain("tee");
		expect(cmd).toContain("curl -fsSL");
		expect(cmd).toContain("-o");
	});

	it("includes a non-empty file guard", () => {
		const cmd = buildDirectSkillInstallCommand(
			"my-skill",
			"https://example.com/skill.md",
		);

		expect(cmd).toContain("test -s");
	});

	it("moves temp file to final SKILL.md path", () => {
		const cmd = buildDirectSkillInstallCommand(
			"my-skill",
			"https://example.com/skill.md",
		);

		expect(cmd).toContain("mv");
		expect(cmd).toMatch(/SKILL\.md\.download.*SKILL\.md/);
	});

	it("joins steps with && so any failure aborts", () => {
		const cmd = buildDirectSkillInstallCommand(
			"my-skill",
			"https://example.com/skill.md",
		);

		const steps = cmd.split(" && ");
		expect(steps.length).toBeGreaterThanOrEqual(3);
	});

	it("shell-quotes a URL with metacharacters", () => {
		const cmd = buildDirectSkillInstallCommand(
			"my-skill",
			"https://example.com/skill;rm -rf /",
		);

		expect(cmd).toContain("'https://example.com/skill;rm -rf /'");
	});
});
