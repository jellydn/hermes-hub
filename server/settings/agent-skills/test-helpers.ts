import { beforeEach, vi } from "vitest";

import { agentSkills, auditLogs } from "../../db/schema";

export const baseRecord = {
	id: "skill_1",
	userId: "user_123",
	name: "test-skill",
	sourceType: "hub",
	installRef: "nousresearch/test-skill",
	content: null,
	enabled: true,
	acceptScannerRisk: false,
	createdAt: new Date("2026-06-06T12:00:00.000Z"),
	updatedAt: new Date("2026-06-06T12:00:00.000Z"),
};

export type AgentSkillsTestMocks = {
	requireAuthSession: ReturnType<typeof vi.fn>;
	dbSelect: ReturnType<typeof vi.fn>;
	dbInsert: ReturnType<typeof vi.fn>;
	dbUpdate: ReturnType<typeof vi.fn>;
	dbDelete: ReturnType<typeof vi.fn>;
	transaction: ReturnType<typeof vi.fn>;
	selectFrom: ReturnType<typeof vi.fn>;
	selectWhere: ReturnType<typeof vi.fn>;
	selectOrderBy: ReturnType<typeof vi.fn>;
	selectLimit: ReturnType<typeof vi.fn>;
	insertValues: ReturnType<typeof vi.fn>;
	updateSet: ReturnType<typeof vi.fn>;
	updateWhere: ReturnType<typeof vi.fn>;
	updateReturning: ReturnType<typeof vi.fn>;
	deleteWhere: ReturnType<typeof vi.fn>;
	deleteReturning: ReturnType<typeof vi.fn>;
	insertAuditValues: ReturnType<typeof vi.fn>;
	withSshConnection: ReturnType<typeof vi.fn>;
	restartGateway: ReturnType<typeof vi.fn>;
	resolveHermesDeployContext: ReturnType<typeof vi.fn>;
};

export function createContext(body: unknown, method = "POST", id?: string) {
	const url = id
		? `http://localhost/api/settings/agent-skills/${id}`
		: "http://localhost/api/settings/agent-skills";

	return {
		req: {
			raw: new Request(url, { method }),
			json: () => Promise.resolve(body),
			param: () => id ?? "",
			header: () => null,
		},
		json: (payload: unknown, status = 200) =>
			new Response(JSON.stringify(payload), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as never;
}

export function installedSkillFindStdout(paths: string[]): string {
	return paths.join("\n");
}

export function createDeployExecMock(options: {
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

export function setupAgentSkillsTestState(mocks: AgentSkillsTestMocks) {
	beforeEach(() => {
		vi.clearAllMocks();

		mocks.requireAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});

		mocks.dbSelect.mockReturnValue({ from: mocks.selectFrom });
		mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
		mocks.selectWhere.mockReturnValue({
			orderBy: mocks.selectOrderBy,
			limit: mocks.selectLimit,
		});
		mocks.selectOrderBy.mockReturnValue([]);
		mocks.selectLimit.mockResolvedValue([]);

		mocks.dbInsert.mockImplementation((table) => {
			if (table === agentSkills) {
				return { values: mocks.insertValues };
			}
			if (table === auditLogs) {
				return { values: mocks.insertAuditValues };
			}
			throw new Error("Unexpected table insert");
		});
		mocks.insertValues.mockReturnValue({
			returning: vi.fn().mockResolvedValue([baseRecord]),
		});
		mocks.insertAuditValues.mockResolvedValue(undefined);

		mocks.dbUpdate.mockReturnValue({ set: mocks.updateSet });
		mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
		mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
		mocks.updateReturning.mockResolvedValue([baseRecord]);

		mocks.dbDelete.mockReturnValue({ where: mocks.deleteWhere });
		mocks.deleteWhere.mockReturnValue({ returning: mocks.deleteReturning });
		mocks.deleteReturning.mockResolvedValue([baseRecord]);

		mocks.transaction.mockImplementation(async (fn) =>
			fn({
				select: mocks.dbSelect,
				insert: mocks.dbInsert,
				update: mocks.dbUpdate,
				delete: mocks.dbDelete,
			}),
		);

		mocks.resolveHermesDeployContext.mockResolvedValue({
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
		mocks.restartGateway.mockResolvedValue("restarted");
	});
}
