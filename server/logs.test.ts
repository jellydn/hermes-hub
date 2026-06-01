import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tableAuditLogs, tableInstallEvents, tableInstalls, tableServers } =
	vi.hoisted(() => ({
		tableInstalls: { kind: "installs" },
		tableInstallEvents: { kind: "installEvents" },
		tableServers: { kind: "servers" },
		tableAuditLogs: { kind: "auditLogs" },
	}));

const getAuthSession = vi.fn();
const deleteWhere = vi.fn();
const selectFrom = vi.fn();

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./db", () => ({
	getDb: () => ({
		select: () => ({ from: selectFrom }),
		delete: () => ({ where: deleteWhere }),
	}),
}));

vi.mock("./db/schema", () => ({
	installs: tableInstalls,
	installEvents: tableInstallEvents,
	servers: tableServers,
	auditLogs: tableAuditLogs,
}));

describe("logs handlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
		selectFrom.mockImplementation((table) => {
			if (table === tableInstalls) {
				return {
					innerJoin: () => ({
						where: () => ({
							orderBy: () => ({
								limit: () =>
									Promise.resolve([
										{
											id: "install_1",
											status: "succeeded",
											step: "start-containers",
											createdAt: new Date("2026-05-26T03:00:00.000Z"),
											updatedAt: new Date("2026-05-26T03:05:00.000Z"),
											serverLabel: "Production VPS",
										},
									]),
							}),
						}),
					}),
				};
			}

			if (table === tableInstallEvents) {
				return {
					where: () => ({
						orderBy: () => ({
							limit: () =>
								Promise.resolve([
									{
										installId: "install_1",
										stepName: "install-docker",
										message: "Installing Docker",
										createdAt: new Date("2026-05-26T03:00:00.000Z"),
									},
								]),
						}),
					}),
				};
			}

			if (table === tableAuditLogs) {
				return {
					where: () => ({
						orderBy: () => ({
							limit: () =>
								Promise.resolve([
									{
										id: "audit_1",
										action: "server.action.restart.failed",
										details: {
											message: "Action failed: host unreachable",
										},
										serverId: "server_123",
										createdAt: new Date("2026-05-26T04:00:00.000Z"),
									},
								]),
						}),
					}),
				};
			}

			if (table === tableServers) {
				return {
					where: () =>
						Promise.resolve([{ id: "server_123", label: "Production VPS" }]),
				};
			}

			throw new Error(`Unexpected table in selectFrom mock: ${String(table)}`);
		});

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

	it("clears persisted action logs and install events", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		selectFrom.mockReturnValueOnce({
			innerJoin: () => ({
				where: () =>
					Promise.resolve([{ id: "install_1" }, { id: "install_2" }]),
			}),
		});

		const { clearLogs } = await import("./logs");
		const response = await clearLogs(createContext());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({ status: "cleared" });
		expect(deleteWhere).toHaveBeenCalledTimes(2);
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
