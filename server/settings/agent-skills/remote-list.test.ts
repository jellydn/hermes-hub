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

		const { getRemoteSkillsList } = await import("../agent-skills");
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

		const { getRemoteSkillsList } = await import("../agent-skills");
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

		const { getRemoteSkillsList } = await import("../agent-skills");
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
