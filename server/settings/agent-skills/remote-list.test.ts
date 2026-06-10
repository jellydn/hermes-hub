import { describe, expect, it, vi } from "vitest";

import { createContext, setupAgentSkillsTestState } from "./test-helpers";

const {
	requireAuthSession,
	dbSelect,
	dbInsert,
	dbUpdate,
	dbDelete,
	transaction,
	selectFrom,
	selectWhere,
	selectOrderBy,
	selectLimit,
	insertValues,
	updateSet,
	updateWhere,
	updateReturning,
	deleteWhere,
	deleteReturning,
	insertAuditValues,
	withSshConnection,
	restartGateway,
	resolveHermesDeployContext,
} = vi.hoisted(() => ({
	requireAuthSession: vi.fn(),
	dbSelect: vi.fn(),
	dbInsert: vi.fn(),
	dbUpdate: vi.fn(),
	dbDelete: vi.fn(),
	transaction: vi.fn(),
	selectFrom: vi.fn(),
	selectWhere: vi.fn(),
	selectOrderBy: vi.fn(),
	selectLimit: vi.fn(),
	insertValues: vi.fn(),
	updateSet: vi.fn(),
	updateWhere: vi.fn(),
	updateReturning: vi.fn(),
	deleteWhere: vi.fn(),
	deleteReturning: vi.fn(),
	insertAuditValues: vi.fn(),
	withSshConnection: vi.fn(),
	restartGateway: vi.fn(),
	resolveHermesDeployContext: vi.fn(),
}));

vi.mock("../../db", () => ({
	getDb: () => ({
		select: dbSelect,
		insert: dbInsert,
		update: dbUpdate,
		delete: dbDelete,
		transaction,
	}),
}));

vi.mock("../../request-guards", () => ({
	requireAuthSession,
}));

vi.mock("../../ssh", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../ssh")>();
	return {
		...actual,
		withSshConnection,
	};
});

vi.mock("../../hermes/runtime", () => ({
	restartGateway,
}));

vi.mock("../../hermes/deploy-context", () => ({
	resolveHermesDeployContext,
}));

setupAgentSkillsTestState({
	requireAuthSession,
	dbSelect,
	dbInsert,
	dbUpdate,
	dbDelete,
	transaction,
	selectFrom,
	selectWhere,
	selectOrderBy,
	selectLimit,
	insertValues,
	updateSet,
	updateWhere,
	updateReturning,
	deleteWhere,
	deleteReturning,
	insertAuditValues,
	withSshConnection,
	restartGateway,
	resolveHermesDeployContext,
});

import { parseInstalledSkillNamesFromFind } from "./remote";

describe("parseInstalledSkillNamesFromFind", () => {
	it("extracts full skill names from find output paths", () => {
		expect(
			parseInstalledSkillNamesFromFind(`
/root/.hermes/skills/thermo-nuclear-code-quality-review/SKILL.md
/root/.hermes/skills/hermeshub/file-reader/SKILL.md
`),
		).toEqual(["thermo-nuclear-code-quality-review", "file-reader"]);
	});
});

describe("getRemoteSkillsList", () => {
	it("returns parsed skills and count on successful command execution", async () => {
		const mockExec = vi.fn().mockImplementation((cmd: string) => {
			if (cmd.includes("hermeshub-agent-skills.json")) {
				return Promise.resolve({ code: 0, stdout: "[]" });
			}
			if (cmd.includes("find") && cmd.includes(".hermes/skills")) {
				return Promise.resolve({
					code: 0,
					stdout: [
						"/root/.hermes/skills/web-search/SKILL.md",
						"/root/.hermes/skills/file-reader/SKILL.md",
					].join("\n"),
				});
			}
			return Promise.resolve({
				code: 0,
				stdout: `
Name         Source   Enabled
web-search   hub      true
file-reader  hub      true
				`,
			});
		});

		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({ execCommand: mockExec });
			},
		);

		const { getRemoteSkillsList } = await import("../agent-skills");
		const response = await getRemoteSkillsList(
			createContext({ serverId: "srv_123" }, "POST"),
		);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.count).toBe(2);
		expect(payload.skills).toEqual(["web-search", "file-reader"]);
		expect(payload.managedManifest).toEqual([]);
		expect(payload.installedSkillNames).toEqual(["web-search", "file-reader"]);
		expect(payload.raw).toContain("web-search   hub      true");
		expect(mockExec).toHaveBeenCalledWith(
			"sudo docker exec hermes hermes skills list",
		);
	});

	it("parses real-world box-drawing table output from hermes CLI", async () => {
		const mockExec = vi.fn().mockImplementation((cmd: string) => {
			if (cmd.includes("hermeshub-agent-skills.json")) {
				return Promise.resolve({ code: 0, stdout: "[]" });
			}
			if (cmd.includes("find") && cmd.includes(".hermes/skills")) {
				return Promise.resolve({
					code: 0,
					stdout: [
						"/root/.hermes/skills/dogfood/SKILL.md",
						"/root/.hermes/skills/yuanbao/SKILL.md",
						"/root/.hermes/skills/claude-code/SKILL.md",
						"/root/.hermes/skills/kanban-codex-lane/SKILL.md",
					].join("\n"),
				});
			}
			return Promise.resolve({
				code: 0,
				stdout: `
Installed Skills
┏━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━┓
┃ Name                 ┃ Category             ┃ Source   ┃ Trust    ┃ Status   ┃
┡━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━╇━━━━━━━━━━╇━━━━━━━━━━┩
│ dogfood              │                      │ builtin  │ builtin  │ enabled  │
│ yuanbao              │                      │ builtin  │ builtin  │ disabled │
│ claude-code          │ autonomous-ai-agents │ builtin  │ builtin  │ enabled  │
│ kanban-codex-lane    │ autonomous-ai-agents │ local    │ local    │ enabled  │
└──────────────────────┴──────────────────────┴──────────┴──────────┴──────────┘
1 hub-installed, 2 builtin, 1 local — 3 enabled, 1 disabled
				`,
			});
		});

		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({ execCommand: mockExec });
			},
		);

		const { getRemoteSkillsList } = await import("../agent-skills");
		const response = await getRemoteSkillsList(
			createContext({ serverId: "srv_123" }, "POST"),
		);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.count).toBe(4);
		expect(payload.managedManifest).toEqual([]);
		expect(payload.installedSkillNames).toEqual([
			"dogfood",
			"yuanbao",
			"claude-code",
			"kanban-codex-lane",
		]);
		expect(payload.skills).toEqual([
			"dogfood",
			"yuanbao",
			"claude-code",
			"kanban-codex-lane",
		]);
	});

	it("returns full filesystem skill names for manifest drift detection", async () => {
		const mockExec = vi.fn().mockImplementation((cmd: string) => {
			if (cmd.includes("hermeshub-agent-skills.json")) {
				return Promise.resolve({
					code: 0,
					stdout: JSON.stringify([
						{
							name: "commit-atomic",
							sourceType: "url",
							installRef: "https://example.com/commit-atomic",
						},
					]),
				});
			}
			if (cmd.includes("find") && cmd.includes(".hermes/skills")) {
				return Promise.resolve({
					code: 0,
					stdout: [
						"/root/.hermes/skills/commit-atomic/SKILL.md",
						"/root/.hermes/skills/thermo-nuclear-code-quality-review/SKILL.md",
					].join("\n"),
				});
			}
			return Promise.resolve({
				code: 0,
				stdout: `
Installed Skills
┏━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━━┓
┃ Name                ┃ Source    ┃ Status   ┃
┡━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━╇━━━━━━━━━━┩
│ thermo-nuclear-cod… │ url       │ enabled  │
│ commit-atomic       │ url       │ enabled  │
└─────────────────────┴───────────┴──────────┘
`,
			});
		});

		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({ execCommand: mockExec });
			},
		);

		const { getRemoteSkillsList } = await import("../agent-skills");
		const response = await getRemoteSkillsList(
			createContext({ serverId: "srv_123" }, "POST"),
		);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.skills).toEqual(["thermo-nuclear-cod", "commit-atomic"]);
		expect(payload.installedSkillNames).toEqual([
			"commit-atomic",
			"thermo-nuclear-code-quality-review",
		]);
	});

	it("returns raw output but zero parsed count if output format is unknown", async () => {
		const mockExec = vi.fn().mockImplementation((cmd: string) => {
			if (cmd.includes("hermeshub-agent-skills.json")) {
				return Promise.resolve({ code: 0, stdout: "[]" });
			}
			if (cmd.includes("find") && cmd.includes(".hermes/skills")) {
				return Promise.resolve({ code: 0, stdout: "" });
			}
			return Promise.resolve({
				code: 0,
				stdout: "Random text output without list structure or headers",
			});
		});

		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({ execCommand: mockExec });
			},
		);

		const { getRemoteSkillsList } = await import("../agent-skills");
		const response = await getRemoteSkillsList(
			createContext({ serverId: "srv_123" }, "POST"),
		);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.count).toBe(0);
		expect(payload.skills).toEqual([]);
		expect(payload.installedSkillNames).toEqual([]);
		expect(payload.raw).toBe(
			"Random text output without list structure or headers",
		);
	});

	it("returns 502 error when SSH or hermes command fails", async () => {
		const mockExec = vi.fn().mockImplementation((cmd: string) => {
			if (cmd.includes("hermeshub-agent-skills.json")) {
				return Promise.resolve({ code: 0, stdout: "[]" });
			}
			if (cmd.includes("find") && cmd.includes(".hermes/skills")) {
				return Promise.resolve({ code: 0, stdout: "" });
			}
			return Promise.resolve({
				code: 1,
				stderr: "Container hermes not found",
			});
		});

		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({ execCommand: mockExec });
			},
		);

		const { getRemoteSkillsList } = await import("../agent-skills");
		const response = await getRemoteSkillsList(
			createContext({ serverId: "srv_123" }, "POST"),
		);

		expect(response.status).toBe(502);
		const payload = await response.json();
		expect(payload.error).toContain(
			"Failed to fetch remote skills: Container hermes not found",
		);
	});
});
