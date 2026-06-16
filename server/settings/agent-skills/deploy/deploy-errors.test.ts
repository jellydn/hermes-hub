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

describe("deploySkillsToHermes — errors", () => {
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

		const { deploySkillsToHermes } = await import("../../agent-skills");
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
