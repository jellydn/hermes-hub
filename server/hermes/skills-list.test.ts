import { describe, expect, it } from "vitest";

import { parseRemoteSkillsList } from "./skills-list";

describe("parseRemoteSkillsList", () => {
	it("parses box-drawing rows with unicode ellipsis truncation", () => {
		const stdout = `
Installed Skills
┏━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━━┓
┃ Name                ┃ Source    ┃ Status   ┃
┡━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━╇━━━━━━━━━━┩
│ thermo-nuclear-cod… │ url       │ enabled  │
│ commit-atomic       │ url       │ enabled  │
└─────────────────────┴───────────┴──────────┘
`;

		const parsed = parseRemoteSkillsList(stdout);
		expect(parsed.skills).toEqual(["thermo-nuclear-cod", "commit-atomic"]);
	});

	it("parses box-drawing rows with ascii ellipsis truncation", () => {
		const stdout = `
┏━━━━━━━━━━━━┳━━━━━━━━━━┓
┃ Name       ┃ Status   ┃
┡━━━━━━━━━━━━╇━━━━━━━━━━┩
│ very-long-name... │ enabled  │
└────────────┴──────────┘
`;

		const parsed = parseRemoteSkillsList(stdout);
		expect(parsed.skills).toEqual(["very-long-name"]);
	});
});
