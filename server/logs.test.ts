import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthSession = vi.fn();
const selectFrom = vi.fn();
const selectInnerJoin = vi.fn();
const selectWhere = vi.fn();
const selectOrderBy = vi.fn();
const selectLimit = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn();
const deleteWhere = vi.fn();

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./db", () => ({
	getDb: () => ({
		select: () => ({ from: selectFrom }),
		update: () => ({ set: updateSet }),
		delete: () => ({ where: deleteWhere }),
	}),
}));

vi.mock("./db/schema", () => ({
	installs: {
		id: Symbol("installs.id"),
		log: Symbol("installs.log"),
		status: Symbol("installs.status"),
		step: Symbol("installs.step"),
		createdAt: Symbol("installs.createdAt"),
		updatedAt: Symbol("installs.updatedAt"),
		serverId: Symbol("installs.serverId"),
	},
	servers: {
		id: Symbol("servers.id"),
		label: Symbol("servers.label"),
		userId: Symbol("servers.userId"),
	},
	auditLogs: {
		id: Symbol("auditLogs.id"),
		action: Symbol("auditLogs.action"),
		details: Symbol("auditLogs.details"),
		createdAt: Symbol("auditLogs.createdAt"),
		userId: Symbol("auditLogs.userId"),
	},
}));

describe("logs handlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		selectFrom.mockReset();
		selectInnerJoin.mockReset();
		selectWhere.mockReset();
		selectOrderBy.mockReset();
		selectLimit.mockReset();
		updateSet.mockReset();
		updateWhere.mockReset();
		deleteWhere.mockReset();

		selectFrom.mockReturnValue({
			innerJoin: selectInnerJoin,
			where: selectWhere,
		});
		selectInnerJoin.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({ orderBy: selectOrderBy });
		selectOrderBy.mockReturnValue({ limit: selectLimit });
		updateSet.mockReturnValue({ where: updateWhere });
		updateWhere.mockResolvedValue(undefined);
		deleteWhere.mockResolvedValue(undefined);
	});

	it("returns unauthorized when reading logs without a session", async () => {
		getAuthSession.mockResolvedValueOnce(null);
		const { getLogs } = await import("./logs");

		const response = await getLogs(createContext());
		const payload = await response.json();

		expect(response.status).toBe(401);
		expect(payload).toEqual({ error: "Unauthorized" });
	});

	it("returns install and action logs for the signed-in user", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		selectWhere
			.mockReturnValueOnce({ orderBy: selectOrderBy })
			.mockReturnValueOnce({ orderBy: selectOrderBy })
			.mockResolvedValueOnce([{ id: "server_123", label: "Production VPS" }]);
		selectLimit
			.mockResolvedValueOnce([
				{
					id: "install_1",
					log: "2026-05-26T03:00:00.000Z [install-docker] Installing Docker",
					status: "succeeded",
					step: "start-containers",
					createdAt: new Date("2026-05-26T03:00:00.000Z"),
					updatedAt: new Date("2026-05-26T03:05:00.000Z"),
					serverLabel: "Production VPS",
				},
			])
			.mockResolvedValueOnce([
				{
					id: "audit_1",
					action: "server.action.restart.failed",
					details: {
						serverId: "server_123",
						message: "Action failed: host unreachable",
					},
					createdAt: new Date("2026-05-26T04:00:00.000Z"),
				},
			]);

		const { getLogs } = await import("./logs");
		const response = await getLogs(createContext());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.logs.installLogs[0]).toMatchObject({
			serverLabel: "Production VPS",
			lines: ["2026-05-26T03:00:00.000Z [install-docker] Installing Docker"],
		});
		expect(payload.logs.actionLogs[0]).toMatchObject({
			action: "restart",
			result: "failed",
			message: "Action failed: host unreachable",
		});
	});

	it("clears persisted install and action logs", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		selectWhere.mockResolvedValueOnce([
			{ id: "server_123", label: "Production VPS" },
		]);

		const { clearLogs } = await import("./logs");
		const response = await clearLogs(createContext());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({ status: "cleared" });
		expect(updateSet).toHaveBeenCalledWith({ log: null });
		expect(deleteWhere).toHaveBeenCalledTimes(1);
	});
});

function createContext() {
	const context = {
		req: {
			raw: {
				headers: new Headers(),
			},
		},
		json: (value: unknown, status = 200) =>
			new Response(JSON.stringify(value), {
				status,
				headers: { "content-type": "application/json" },
			}),
	};

	return context as unknown as Context;
}
