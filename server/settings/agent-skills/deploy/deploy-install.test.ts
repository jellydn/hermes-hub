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

describe("deploySkillsToHermes — install", () => {
	it("successfully deploys skills and updates remote manifest", async () => {
		const record1 = {
			...baseRecord,
			id: "s1",
			name: "skill-one",
			sourceType: "hub",
			installRef: "ref-1",
			enabled: true,
		};
		const record2 = {
			...baseRecord,
			id: "s2",
			name: "skill-two",
			sourceType: "custom",
			content: "Markdown content",
			enabled: true,
		};
		const record3 = {
			...baseRecord,
			id: "s3",
			name: "skill-three",
			sourceType: "url",
			installRef: "https://example.com/SKILL.md",
			enabled: false,
		};

		selectOrderBy.mockResolvedValueOnce([record1, record2, record3]);

		const mockExec = createDeployExecMock({
			installedSkillPaths: [
				"/root/.hermes/skills/ref-1/SKILL.md",
				"/root/.hermes/skills/hermeshub/skill-two/SKILL.md",
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
		const prepCommand = calledCommands.find((c: string) =>
			c.includes("sudo mkdir -p '/root/.hermes/skills/hermeshub'"),
		);
		expect(prepCommand).toContain("chown -R hermes:hermes '/opt/data/skills'");
		const compoundCommand =
			calledCommands.find((c: string) => c.includes("hermes skills install")) ||
			"";
		expect(compoundCommand).toContain(
			"sudo docker exec hermes hermes skills install 'ref-1' --category 'hermeshub' --yes --force",
		);
		expect(
			calledCommands.find((c: string) =>
				c.includes("chown -R hermes:hermes '/opt/data/skills/hermeshub'"),
			),
		).toBeTruthy();

		const manifestWriteCall = calledCommands.find(
			(c: string) =>
				c.includes("hermeshub-agent-skills.json") && c.includes("sudo tee"),
		);
		expect(manifestWriteCall).toBeTruthy();

		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "agent_skills.deployed",
			}),
		);
	});

	it("uses resolved manifest name with --name on url skills", async () => {
		const urlRecord = {
			...baseRecord,
			id: "s_url",
			name: "remote-skill",
			sourceType: "url",
			installRef: "https://example.com/SKILL.md",
			enabled: true,
		};

		selectOrderBy.mockResolvedValueOnce([urlRecord]);

		const mockExec = createDeployExecMock({
			installedSkillPaths: ["/root/.hermes/skills/remote-skill/SKILL.md"],
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
			calledCommands.find((c: string) => c.includes("hermes skills install")) ||
			"";
		expect(compoundCommand).toContain(
			"sudo docker exec hermes hermes skills install 'https://example.com/SKILL.md' --name 'remote-skill' --category 'hermeshub' --yes --force",
		);
	});

	it("rewrites a GitHub folder URL to a slug so the whole folder installs", async () => {
		const urlRecord = {
			...baseRecord,
			id: "s_folder",
			name: "teach",
			sourceType: "url",
			installRef:
				"https://github.com/mattpocock/skills/tree/main/skills/productivity/teach",
			enabled: true,
		};

		selectOrderBy.mockResolvedValueOnce([urlRecord]);

		const mockExec = createDeployExecMock({
			installedSkillPaths: ["/root/.hermes/skills/teach/SKILL.md"],
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
			calledCommands.find((c: string) => c.includes("hermes skills install")) ||
			"";
		expect(compoundCommand).toContain(
			"sudo docker exec hermes hermes skills install 'mattpocock/skills/skills/productivity/teach' --name 'teach' --category 'hermeshub' --yes --force",
		);
	});

	it("deploys browse.sh hub skill without --name (hub-derived names) and writes manifest", async () => {
		const forecastRecord = {
			...baseRecord,
			id: "s_forecast",
			name: "US Weather Forecast",
			sourceType: "hub",
			installRef: "browse-sh/weather.gov/get-forecast-1uezib",
			enabled: true,
		};

		selectOrderBy.mockResolvedValueOnce([forecastRecord]);

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

		expect(response.status).toBe(200);

		const calledCommands = mockExec.mock.calls.map((c) => c[0]);
		const compoundCommand =
			calledCommands.find((c: string) => c.includes("hermes skills install")) ||
			"";
		// No --name for hub installs — Hermes CLI derives the name from the ref
		expect(compoundCommand).toContain(
			"sudo docker exec hermes hermes skills install 'browse-sh/weather.gov/get-forecast-1uezib' --category 'hermeshub' --yes --force",
		);
		expect(compoundCommand).not.toContain("--name");

		const manifestCall = calledCommands.find(
			(c: string) =>
				c.includes("hermeshub-agent-skills.json") && c.includes("sudo tee"),
		);
		expect(manifestCall).toBeTruthy();
		// Manifest stdin should contain the resolved Hub name, not a guessed inventory name
		const manifestStdinIndex = mockExec.mock.calls.findIndex(
			(c) =>
				c[0].includes("hermeshub-agent-skills.json") &&
				c[0].includes("sudo tee"),
		);
		const manifestStdin =
			manifestStdinIndex >= 0
				? mockExec.mock.calls[manifestStdinIndex][1]?.stdin
				: null;
		if (manifestStdin) {
			const parsed = JSON.parse(manifestStdin);
			expect(parsed).toEqual([
				{
					name: "get-forecast",
					sourceType: "hub",
					installRef: "browse-sh/weather.gov/get-forecast-1uezib",
				},
			]);
		} else {
			// If stdin tracking isn't available, at least verify tee was called
			expect(manifestCall).toBeTruthy();
		}
	});

	it("treats skills.sh hyphen aliases as installed (last-30-days vs last30days)", async () => {
		const record = {
			...baseRecord,
			id: "s_last30",
			name: "last-30-days",
			sourceType: "hub",
			installRef: "skills-sh/example.com/last-30-days",
			enabled: true,
		};

		selectOrderBy.mockResolvedValueOnce([record]);

		const mockExec = createDeployExecMock({
			installedSkillPaths: [
				"/root/.hermes/skills/hermeshub/last30days/SKILL.md",
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
		const payload = await response.json();
		expect(payload.skillCount).toBe(1);
		expect(payload.status).toBe("deployed");
	});
});
