import { beforeEach, describe, expect, it, vi } from "vitest";

import { agentSkills, auditLogs } from "../db/schema";

const getAuthSession = vi.fn();
const requireAuthSession = vi.fn();
const dbSelect = vi.fn();
const dbInsert = vi.fn();
const dbUpdate = vi.fn();
const dbDelete = vi.fn();
const transaction = vi.fn();
const selectFrom = vi.fn();
const selectWhere = vi.fn();
const selectOrderBy = vi.fn();
const selectLimit = vi.fn();
const insertValues = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn();
const updateReturning = vi.fn();
const deleteWhere = vi.fn();
const deleteReturning = vi.fn();
const insertAuditValues = vi.fn();
const withSshConnection = vi.fn();
const restartGateway = vi.fn();
const resolveHermesDeployContext = vi.fn();

vi.mock("../auth", () => ({
	getAuthSession,
}));

vi.mock("../db", () => ({
	getDb: () => ({
		select: dbSelect,
		insert: dbInsert,
		update: dbUpdate,
		delete: dbDelete,
		transaction,
	}),
}));

vi.mock("../request-guards", () => ({
	requireAuthSession,
}));

vi.mock("../ssh", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../ssh")>();
	return {
		...actual,
		withSshConnection,
	};
});

vi.mock("../hermes/runtime", () => ({
	restartGateway,
}));

vi.mock("../hermes/deploy-context", () => ({
	resolveHermesDeployContext,
}));

const baseRecord = {
	id: "skill_1",
	userId: "user_123",
	name: "test-skill",
	sourceType: "hub",
	installRef: "nousresearch/test-skill",
	content: null,
	enabled: true,
	createdAt: new Date("2026-06-06T12:00:00.000Z"),
	updatedAt: new Date("2026-06-06T12:00:00.000Z"),
};

describe("agent skills settings", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		getAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});
		requireAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({
			orderBy: selectOrderBy,
			limit: selectLimit,
		});
		selectOrderBy.mockReturnValue([]);
		selectLimit.mockResolvedValue([]);

		dbInsert.mockImplementation((table) => {
			if (table === agentSkills) {
				return { values: insertValues };
			}
			if (table === auditLogs) {
				return { values: insertAuditValues };
			}
			throw new Error("Unexpected table insert");
		});
		insertValues.mockReturnValue({
			returning: vi.fn().mockResolvedValue([baseRecord]),
		});
		insertAuditValues.mockResolvedValue(undefined);

		dbUpdate.mockReturnValue({ set: updateSet });
		updateSet.mockReturnValue({ where: updateWhere });
		updateWhere.mockReturnValue({ returning: updateReturning });
		updateReturning.mockResolvedValue([baseRecord]);

		dbDelete.mockReturnValue({ where: deleteWhere });
		deleteWhere.mockReturnValue({ returning: deleteReturning });
		deleteReturning.mockResolvedValue([baseRecord]);

		transaction.mockImplementation(async (fn) =>
			fn({
				select: dbSelect,
				insert: dbInsert,
				update: dbUpdate,
				delete: dbDelete,
			}),
		);

		resolveHermesDeployContext.mockResolvedValue({
			sshCtx: {
				serverId: "server_1",
				server: {
					host: "1.2.3.4",
					port: 22,
					username: "root",
					hostKeyFingerprint: null,
				},
				authMethod: "ssh-key",
				credential: "mock-credential",
			},
		});
		restartGateway.mockResolvedValue("restarted");
	});

	describe("createAgentSkill", () => {
		it("creates a hub skill with valid input", async () => {
			selectLimit.mockResolvedValueOnce([]);

			const { createAgentSkill } = await import("./agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "my-skill",
					sourceType: "hub",
					installRef: "nous/my-skill",
				}),
			);

			expect(response.status).toBe(200);
			const payload = await response.json();
			expect(payload.skill.name).toBe("test-skill");
			expect(insertValues).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "my-skill",
					sourceType: "hub",
					installRef: "nous/my-skill",
				}),
			);
			expect(insertAuditValues).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "agent_skill.created",
				}),
			);
		});

		it("returns 400 when name is invalid", async () => {
			const { createAgentSkill } = await import("./agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "1-invalid-name",
					sourceType: "hub",
					installRef: "nous/my-skill",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error:
					"Skill name must start with a letter and contain only letters, numbers, underscores, or hyphens.",
			});
		});

		it("returns 400 when hub installRef has newlines", async () => {
			const { createAgentSkill } = await import("./agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "my-skill",
					sourceType: "hub",
					installRef: "nous/my-skill\nbreak",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error:
					"installRef for hub skills must be a valid repository or package reference (e.g., owner/repo or owner/repo@version).",
			});
		});

		it("returns 400 when hub installRef has invalid characters", async () => {
			const { createAgentSkill } = await import("./agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "my-skill",
					sourceType: "hub",
					installRef: "nous/my skill; rm -rf /",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error:
					"installRef for hub skills must be a valid repository or package reference (e.g., owner/repo or owner/repo@version).",
			});
		});

		it("returns 400 when url installRef is invalid URL", async () => {
			const { createAgentSkill } = await import("./agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "my-skill",
					sourceType: "url",
					installRef: "not-a-url",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "installRef for url skills must be a valid http or https URL.",
			});
		});

		it("returns 400 when custom content is empty", async () => {
			const { createAgentSkill } = await import("./agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "my-skill",
					sourceType: "custom",
					content: "   ",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "content is required for custom skills.",
			});
		});

		it("returns 400 when unique name conflict occurs", async () => {
			selectLimit.mockResolvedValueOnce([baseRecord]);

			const { createAgentSkill } = await import("./agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "test-skill",
					sourceType: "hub",
					installRef: "nous/test-skill",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "An agent skill with this name already exists.",
			});
		});
	});

	describe("updateAgentSkill", () => {
		it("updates an existing skill", async () => {
			selectLimit.mockResolvedValueOnce([baseRecord]); // for getOwnedAgentSkillRecord

			const { updateAgentSkill } = await import("./agent-skills");
			const response = await updateAgentSkill(
				createContext({ enabled: false }, "PUT", "skill_1"),
			);

			expect(response.status).toBe(200);
			expect(updateSet).toHaveBeenCalledWith(
				expect.objectContaining({
					enabled: false,
				}),
			);
			expect(insertAuditValues).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "agent_skill.updated",
				}),
			);
		});

		it("returns 404 when skill does not exist", async () => {
			selectLimit.mockResolvedValueOnce([]); // not found

			const { updateAgentSkill } = await import("./agent-skills");
			const response = await updateAgentSkill(
				createContext({ enabled: false }, "PUT", "skill_invalid"),
			);

			expect(response.status).toBe(404);
		});
	});

	describe("deleteAgentSkill", () => {
		it("deletes a skill and logs audit action", async () => {
			selectLimit.mockResolvedValueOnce([baseRecord]); // for getOwnedAgentSkillRecord

			const { deleteAgentSkill } = await import("./agent-skills");
			const response = await deleteAgentSkill(
				createContext(null, "DELETE", "skill_1"),
			);

			expect(response.status).toBe(200);
			expect(dbDelete).toHaveBeenCalled();
			expect(insertAuditValues).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "agent_skill.deleted",
				}),
			);
		});
	});

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

			const mockExec = vi.fn().mockResolvedValue({ code: 0, stdout: "" });
			withSshConnection.mockImplementation(
				async (
					_config: unknown,
					callback: (ssh: unknown) => Promise<unknown>,
				) => {
					return callback({ execCommand: mockExec });
				},
			);

			const { deploySkillsToHermes } = await import("./agent-skills");
			const response = await deploySkillsToHermes(
				createContext({ serverId: "srv_123" }, "POST"),
			);

			expect(response.status).toBe(200);

			// check that uninstall was NOT run since manifest was empty
			// check that install commands were called for skill-one (hub) and skill-two (custom write)
			const calledCommands = mockExec.mock.calls.map((c) => c[0]);
			const compoundCommand = calledCommands[1] || "";
			expect(compoundCommand).toContain(
				"sudo docker exec hermes hermes skills install 'ref-1' --name 'skill-one' --yes",
			);
			expect(compoundCommand).toContain("skill-two/SKILL.md");
			expect(compoundCommand).toContain("hermeshub-agent-skills.json");

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
				installRef: "ref-1",
				enabled: true,
			};
			selectOrderBy.mockResolvedValueOnce([record1]);

			const mockExec = vi.fn().mockImplementation((cmd: string) => {
				if (
					cmd.includes("cat") &&
					cmd.includes("hermeshub-agent-skills.json")
				) {
					return Promise.resolve({
						code: 0,
						stdout: JSON.stringify([
							{ name: "skill-one", sourceType: "hub" },
							{ name: "skill-old-hub", sourceType: "hub" },
							{ name: "skill-old-custom", sourceType: "custom" },
						]),
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

			const { deploySkillsToHermes } = await import("./agent-skills");
			const response = await deploySkillsToHermes(
				createContext({ serverId: "srv_123" }, "POST"),
			);

			expect(response.status).toBe(200);
			const calledCommands = mockExec.mock.calls.map((c) => c[0]);
			const compoundCommand = calledCommands[1] || "";

			// should uninstall old hub skill
			expect(compoundCommand).toContain(
				"echo y | sudo docker exec -i hermes hermes skills uninstall 'skill-old-hub'",
			);
			// should remove old custom skill directory
			expect(compoundCommand).toContain("rm -rf");
			expect(compoundCommand).toContain("skill-old-custom");
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

			const mockExec = vi.fn().mockImplementation((cmd: string) => {
				if (cmd.includes("install")) {
					return Promise.resolve({ code: 1, stderr: "Install failed!" });
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

			const { deploySkillsToHermes } = await import("./agent-skills");
			const response = await deploySkillsToHermes(
				createContext({ serverId: "srv_123" }, "POST"),
			);

			expect(response.status).toBe(502);
			expect(insertAuditValues).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "agent_skills.deploy.failed",
				}),
			);
		});
	});

	describe("getRemoteSkillsList", () => {
		it("returns parsed skills and count on successful command execution", async () => {
			const mockExec = vi.fn().mockResolvedValue({
				code: 0,
				stdout: `
Name         Source   Enabled
web-search   hub      true
file-reader  hub      true
				`,
			});

			withSshConnection.mockImplementation(
				async (
					_config: unknown,
					callback: (ssh: unknown) => Promise<unknown>,
				) => {
					return callback({ execCommand: mockExec });
				},
			);

			const { getRemoteSkillsList } = await import("./agent-skills");
			const response = await getRemoteSkillsList(
				createContext({ serverId: "srv_123" }, "POST"),
			);

			expect(response.status).toBe(200);
			const payload = await response.json();
			expect(payload.count).toBe(2);
			expect(payload.skills).toEqual(["web-search", "file-reader"]);
			expect(payload.raw).toContain("web-search   hub      true");
			expect(mockExec).toHaveBeenCalledWith(
				"sudo docker exec hermes hermes skills list",
			);
		});

		it("parses real-world box-drawing table output from hermes CLI", async () => {
			const mockExec = vi.fn().mockResolvedValue({
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

			withSshConnection.mockImplementation(
				async (
					_config: unknown,
					callback: (ssh: unknown) => Promise<unknown>,
				) => {
					return callback({ execCommand: mockExec });
				},
			);

			const { getRemoteSkillsList } = await import("./agent-skills");
			const response = await getRemoteSkillsList(
				createContext({ serverId: "srv_123" }, "POST"),
			);

			expect(response.status).toBe(200);
			const payload = await response.json();
			expect(payload.count).toBe(4);
			expect(payload.skills).toEqual([
				"dogfood",
				"yuanbao",
				"claude-code",
				"kanban-codex-lane",
			]);
		});

		it("returns raw output but zero parsed count if output format is unknown", async () => {
			const mockExec = vi.fn().mockResolvedValue({
				code: 0,
				stdout: "Random text output without list structure or headers",
			});

			withSshConnection.mockImplementation(
				async (
					_config: unknown,
					callback: (ssh: unknown) => Promise<unknown>,
				) => {
					return callback({ execCommand: mockExec });
				},
			);

			const { getRemoteSkillsList } = await import("./agent-skills");
			const response = await getRemoteSkillsList(
				createContext({ serverId: "srv_123" }, "POST"),
			);

			expect(response.status).toBe(200);
			const payload = await response.json();
			expect(payload.count).toBe(0);
			expect(payload.skills).toEqual([]);
			expect(payload.raw).toBe(
				"Random text output without list structure or headers",
			);
		});

		it("returns 502 error when SSH or hermes command fails", async () => {
			const mockExec = vi.fn().mockResolvedValue({
				code: 1,
				stderr: "Container hermes not found",
			});

			withSshConnection.mockImplementation(
				async (
					_config: unknown,
					callback: (ssh: unknown) => Promise<unknown>,
				) => {
					return callback({ execCommand: mockExec });
				},
			);

			const { getRemoteSkillsList } = await import("./agent-skills");
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
});

function createContext(body: unknown, method = "POST", id?: string) {
	const url = id
		? `http://localhost/api/settings/agent-skills/${id}`
		: "http://localhost/api/settings/agent-skills";

	return {
		req: {
			raw: new Request(url, { method }),
			json: () => Promise.resolve(body),
			param: (name?: string) => {
				if (name === "id") return id ?? "";
				return id ?? "";
			},
			header: () => null,
		},
		json: (payload: unknown, status = 200) =>
			new Response(JSON.stringify(payload), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as never;
}
