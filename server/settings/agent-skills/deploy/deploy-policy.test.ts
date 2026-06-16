import { describe, expect, it, vi } from "vitest";

import {
	baseRecord,
	createContext,
	createDeployExecMock,
	setupAgentSkillsTestState,
} from "../test-helpers";

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

vi.mock("../../../db", () => ({
	getDb: () => ({
		select: dbSelect,
		insert: dbInsert,
		update: dbUpdate,
		delete: dbDelete,
		transaction,
	}),
}));

vi.mock("../../../request-guards", () => ({
	requireAuthSession,
}));

vi.mock("../../../ssh", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../ssh")>();
	return {
		...actual,
		withSshConnection,
	};
});

vi.mock("../../../hermes/runtime", () => ({
	restartGateway,
}));

vi.mock("../../../hermes/deploy-context", () => ({
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

describe("deploySkillsToHermes — policy", () => {
	it("fails deploy with 502 when an enabled Hub skill is missing from remote inventory (regression: geo-weather-fetch)", async () => {
		const weatherRecord = {
			...baseRecord,
			id: "s_weather",
			name: "geo-weather-fetch",
			sourceType: "hub",
			installRef: "browse-sh/windy.com/geo-weather-fetch-w3o49h",
			enabled: true,
		};

		selectOrderBy.mockResolvedValueOnce([weatherRecord]);

		const mockExec = createDeployExecMock({
			installedSkillPaths: ["/root/.hermes/skills/get-forecast/SKILL.md"],
		});
		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({ execCommand: mockExec });
			},
		);

		const { deploySkillsToHermes } = await import("../../agent-skills");
		const response = await deploySkillsToHermes(
			createContext({ serverId: "srv_123" }, "POST"),
		);

		// Partial success: deploy completed but skill was blocked
		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.blockedSkills).toEqual(["geo-weather-fetch"]);
		expect(payload.skillCount).toBe(0);
		expect(payload.status).toBe("deployed");
		// Manifest must NOT include geo-weather-fetch (only installed skills)
		const calledCommands = mockExec.mock.calls.map((c) => c[0]);
		const manifestTeeCall = calledCommands.find(
			(c: string) =>
				c.includes("hermeshub-agent-skills.json") && c.includes("sudo tee"),
		);
		// Manifest was written (with only installed skills)
		expect(manifestTeeCall).toBeTruthy();
		// Success audit log should have been written (not failure)
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "agent_skills.deployed",
			}),
		);
	});

	it.each([
		{ name: "../etc/passwd", sourceType: "hub" },
		{ name: "foo/bar", sourceType: "custom" },
	])("throws when manifest contains unsafe name '$name'", async ({
		name,
		sourceType,
	}) => {
		selectOrderBy.mockResolvedValueOnce([]);

		const mockExec = vi.fn().mockImplementation((cmd: string) => {
			if (cmd.includes("cat") && cmd.includes("hermeshub-agent-skills.json")) {
				return Promise.resolve({
					code: 0,
					stdout: JSON.stringify([{ name, sourceType }]),
				});
			}
			return Promise.resolve({ code: 0, stdout: "" });
		});

		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({ execCommand: mockExec });
			},
		);

		const { deploySkillsToHermes } = await import("../../agent-skills");
		const response = await deploySkillsToHermes(
			createContext({ serverId: "srv_123" }, "POST"),
		);

		expect(response.status).toBe(502);
		const payload = await response.json();
		expect(payload.error).toContain("Unsafe manifest name");
		expect(payload.error).toContain(name);
	});

	it("uses direct SKILL.md write when acceptScannerRisk is enabled for a URL skill", async () => {
		const record = {
			...baseRecord,
			id: "s_url",
			name: "remote-skill",
			sourceType: "url",
			installRef: "https://example.com/SKILL.md",
			enabled: true,
			acceptScannerRisk: true,
		};

		selectOrderBy.mockResolvedValueOnce([record]);

		const mockExec = createDeployExecMock({
			installedSkillPaths: [
				"/root/.hermes/skills/hermeshub/remote-skill/SKILL.md",
			],
		});
		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({ execCommand: mockExec });
			},
		);

		const { deploySkillsToHermes } = await import("../../agent-skills");
		const response = await deploySkillsToHermes(
			createContext({ serverId: "srv_123" }, "POST"),
		);

		expect(response.status).toBe(200);
		const calledCommands = mockExec.mock.calls.map((c) => c[0]);
		const compoundCommand =
			calledCommands.find((c: string) => c.includes("curl -fsSL")) || "";
		expect(compoundCommand).toContain("https://example.com/SKILL.md");
		expect(compoundCommand).not.toContain("hermes skills install");
	});

	it("uses raw GitHub SKILL.md curl for url skills with GitHub folder URLs", async () => {
		const record = {
			...baseRecord,
			id: "s_pr_review",
			name: "pr-review",
			sourceType: "url",
			installRef: "https://github.com/owner/repo/tree/main/skills/pr-review",
			enabled: true,
			acceptScannerRisk: true,
		};

		selectOrderBy.mockResolvedValueOnce([record]);

		const mockExec = createDeployExecMock({
			installedSkillPaths: [
				"/root/.hermes/skills/hermeshub/pr-review/SKILL.md",
			],
		});
		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({ execCommand: mockExec });
			},
		);

		const { deploySkillsToHermes } = await import("../../agent-skills");
		const response = await deploySkillsToHermes(
			createContext({ serverId: "srv_123" }, "POST"),
		);

		expect(response.status).toBe(200);
		const calledCommands = mockExec.mock.calls.map((c) => c[0]);
		const compoundCommand =
			calledCommands.find((c: string) => c.includes("curl -fsSL")) || "";
		expect(compoundCommand).toContain(
			"https://raw.githubusercontent.com/owner/repo/main/skills/pr-review/SKILL.md",
		);
		expect(compoundCommand).not.toContain("hermes skills install");
	});

	it("reports bypass-unavailable skills when scanner bypass cannot derive a fetch URL", async () => {
		const record = {
			...baseRecord,
			id: "s_opaque",
			name: "opaque-skill",
			sourceType: "hub",
			installRef: "skills-sh/example.com/opaque-skill",
			enabled: true,
			acceptScannerRisk: true,
		};

		selectOrderBy.mockResolvedValueOnce([record]);

		const mockExec = createDeployExecMock({
			installedSkillPaths: [],
		});
		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({ execCommand: mockExec });
			},
		);

		const { deploySkillsToHermes } = await import("../../agent-skills");
		const response = await deploySkillsToHermes(
			createContext({ serverId: "srv_123" }, "POST"),
		);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.bypassUnavailableSkills).toEqual(["opaqueskill"]);
		expect(payload.blockedSkills).toEqual([]);
		const calledCommands = mockExec.mock.calls.map((c) => c[0]);
		expect(
			calledCommands.some((c: string) => c.includes("hermes skills install")),
		).toBe(false);
	});
});
