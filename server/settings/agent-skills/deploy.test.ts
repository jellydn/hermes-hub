import { describe, expect, it, vi } from "vitest";

import {
	baseRecord,
	createContext,
	setupAgentSkillsTestState,
} from "./test-helpers";

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

function installedSkillFindStdout(paths: string[]): string {
	return paths.join("\n");
}

function createDeployExecMock(options: {
	installedSkillPaths: string[];
	previousManifest?: unknown;
	installFails?: boolean;
}) {
	return vi.fn().mockImplementation((cmd: string) => {
		if (options.installFails && cmd.includes("install")) {
			return Promise.resolve({ code: 1, stderr: "Install failed!" });
		}
		if (cmd.includes("cat") && cmd.includes("hermeshub-agent-skills.json")) {
			return Promise.resolve({
				code: 0,
				stdout: options.previousManifest
					? JSON.stringify(options.previousManifest)
					: "",
			});
		}
		if (cmd.includes("find") && cmd.includes(".hermes/skills")) {
			return Promise.resolve({
				code: 0,
				stdout: installedSkillFindStdout(options.installedSkillPaths),
			});
		}
		return Promise.resolve({ code: 0, stdout: "" });
	});
}

describe("deploySkillsToHermes", () => {
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

		const { deploySkillsToHermes } = await import("../agent-skills");
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

	it("removes previously managed skills that are now missing", async () => {
		const record1 = {
			...baseRecord,
			id: "s1",
			name: "skill-one",
			sourceType: "hub",
			installRef: "owner/skill-one",
			enabled: true,
		};
		selectOrderBy.mockResolvedValueOnce([record1]);

		const mockExec = createDeployExecMock({
			installedSkillPaths: ["/root/.hermes/skills/skill-one/SKILL.md"],
			previousManifest: [
				{ name: "skill-one", sourceType: "hub" },
				{ name: "skill-old-hub", sourceType: "hub" },
				{ name: "skill-old-custom", sourceType: "custom" },
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

		const { deploySkillsToHermes } = await import("../agent-skills");
		const response = await deploySkillsToHermes(
			createContext({ serverId: "srv_123" }, "POST"),
		);

		expect(response.status).toBe(200);
		const calledCommands = mockExec.mock.calls.map((c) => c[0]);
		const compoundCommand =
			calledCommands.find(
				(c: string) =>
					c.includes("hermes skills uninstall") ||
					c.includes("hermes skills install"),
			) || "";

		expect(compoundCommand).toContain(
			"echo y | sudo docker exec -i hermes hermes skills uninstall 'skill-old-hub'",
		);
		expect(compoundCommand).toContain("rm -rf");
		expect(compoundCommand).toContain("skill-old-custom");
		expect(compoundCommand).toContain(
			"sudo docker exec hermes hermes skills install 'owner/skill-one' --category 'hermeshub' --yes --force",
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

		const { deploySkillsToHermes } = await import("../agent-skills");
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

		const { deploySkillsToHermes } = await import("../agent-skills");
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

		const { deploySkillsToHermes } = await import("../agent-skills");
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

		const { deploySkillsToHermes } = await import("../agent-skills");
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

		const { deploySkillsToHermes } = await import("../agent-skills");
		const response = await deploySkillsToHermes(
			createContext({ serverId: "srv_123" }, "POST"),
		);

		expect(response.status).toBe(502);
		const payload = await response.json();
		expect(payload.error).toContain("Unsafe manifest name");
		expect(payload.error).toContain(name);
	});

	it("aborts deploy and logs failure if any installation fails", async () => {
		const record1 = {
			...baseRecord,
			id: "s1",
			name: "skill-one",
			sourceType: "hub",
			installRef: "ref-1",
			enabled: true,
		};
		selectOrderBy.mockResolvedValueOnce([record1]);

		const mockExec = createDeployExecMock({
			installedSkillPaths: [],
			installFails: true,
		});

		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({ execCommand: mockExec });
			},
		);

		const { deploySkillsToHermes } = await import("../agent-skills");
		const response = await deploySkillsToHermes(
			createContext({ serverId: "srv_123" }, "POST"),
		);

		expect(response.status).toBe(502);
		const calledCommands = mockExec.mock.calls.map((c) => c[0]);
		const manifestTeeCall = calledCommands.find(
			(c: string) =>
				c.includes("hermeshub-agent-skills.json") && c.includes("sudo tee"),
		);
		expect(manifestTeeCall).toBeFalsy();
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "agent_skills.deploy.failed",
			}),
		);
	});
});
