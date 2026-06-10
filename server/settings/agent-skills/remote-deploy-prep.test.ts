import { describe, expect, it } from "vitest";

import {
	buildChownHermeshubSkillsCommand,
	buildEnsureHermesSkillsWritableCommand,
} from "./remote";

describe("remote deploy prep commands", () => {
	it("creates hermeshub and chowns the container skills tree before install", () => {
		expect(buildEnsureHermesSkillsWritableCommand()).toBe(
			"sudo mkdir -p '/root/.hermes/skills/hermeshub' && sudo docker exec hermes chown -R hermes:hermes '/opt/data/skills' 2>/dev/null || true",
		);
	});

	it("chowns hermeshub after root-owned custom skill writes", () => {
		expect(buildChownHermeshubSkillsCommand()).toBe(
			"sudo docker exec hermes chown -R hermes:hermes '/opt/data/skills/hermeshub' 2>/dev/null || true",
		);
	});
});
