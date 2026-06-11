import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	tableAuditLogs,
	tableInstallEvents,
	tableInstalls,
	tableServers,
	getAuthSession,
	deleteWhere,
	selectFrom,
	transaction,
} = vi.hoisted(() => ({
	tableInstalls: { kind: "installs" },
	tableInstallEvents: { kind: "installEvents" },
	tableServers: { kind: "servers" },
	tableAuditLogs: { kind: "auditLogs" },
	getAuthSession: vi.fn(),
	deleteWhere: vi.fn(),
	selectFrom: vi.fn(),
	transaction: vi.fn(),
}));

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./db", () => ({
	getDb: () => ({
		select: () => ({ from: selectFrom }),
		delete: () => ({ where: deleteWhere }),
		transaction,
	}),
}));

vi.mock("./db/schema", () => ({
	installs: tableInstalls,
	installEvents: tableInstallEvents,
	servers: tableServers,
	auditLogs: tableAuditLogs,
}));

import { clearLogs, getLogs } from "./logs";

describe("logs handlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		deleteWhere.mockResolvedValue(undefined);
		transaction.mockImplementation(async (fn) =>
			fn({
				delete: () => ({ where: deleteWhere }),
			}),
		);
	});

	it("returns unauthorized when reading logs without a session", async () => {
		getAuthSession.mockResolvedValueOnce(null);

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

	it("includes settings deployment audit rows with concise summaries", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		selectFrom.mockImplementation((table) => {
			if (table === tableInstalls) {
				return {
					innerJoin: () => ({
						where: () => ({
							orderBy: () => ({
								limit: () => Promise.resolve([]),
							}),
						}),
					}),
				};
			}

			if (table === tableInstallEvents) {
				return {
					where: () => ({
						orderBy: () => ({
							limit: () => Promise.resolve([]),
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
										id: "audit_mcp_ok",
										action: "mcp.deployed",
										details: { serverId: "server_123", serverCount: 3 },
										serverId: "server_123",
										createdAt: new Date("2026-05-26T05:00:00.000Z"),
									},
									{
										id: "audit_mcp_fail",
										action: "mcp.deploy.failed",
										details: {
											serverId: "server_123",
											serverCount: 3,
											error: "SSH connection refused",
										},
										serverId: "server_123",
										createdAt: new Date("2026-05-26T05:01:00.000Z"),
									},
									{
										id: "audit_skills_ok",
										action: "agent_skills.deployed",
										details: { serverId: "server_123", skillCount: 1 },
										serverId: "server_123",
										createdAt: new Date("2026-05-26T05:02:00.000Z"),
									},
									{
										id: "audit_skills_fail",
										action: "agent_skills.deploy.failed",
										details: { serverId: "server_123", skillCount: 2 },
										serverId: "server_123",
										createdAt: new Date("2026-05-26T05:03:00.000Z"),
									},
									{
										id: "audit_persona_ok",
										action: "persona.deployed",
										details: { serverId: "server_123" },
										serverId: "server_123",
										createdAt: new Date("2026-05-26T05:04:00.000Z"),
									},
									{
										id: "audit_persona_fail",
										action: "persona.deploy.failed",
										details: {
											serverId: "server_123",
											error: "soul.md write failed",
										},
										serverId: "server_123",
										createdAt: new Date("2026-05-26T05:05:00.000Z"),
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

		const response = await getLogs(createContext());
		const payload = await response.json();

		expect(response.status).toBe(200);
		const byId = new Map<string, (typeof payload.logs.actionLogs)[number]>(
			payload.logs.actionLogs.map(
				(entry: { id: string }) => [entry.id, entry] as const,
			),
		);

		expect(byId.get("audit_mcp_ok")).toMatchObject({
			action: "mcp",
			result: "succeeded",
			serverLabel: "Production VPS",
			message: "MCP servers: Deployed to Production VPS (3 MCP servers).",
		});
		expect(byId.get("audit_mcp_fail")).toMatchObject({
			action: "mcp",
			result: "failed",
			message: "SSH connection refused",
		});
		expect(byId.get("audit_skills_ok")).toMatchObject({
			action: "agent_skills",
			result: "succeeded",
			message: "Agent skills: Deployed to Production VPS (1 enabled skill).",
		});
		expect(byId.get("audit_skills_fail")).toMatchObject({
			action: "agent_skills",
			result: "failed",
			message:
				"Agent skills: Deploy failed to Production VPS (2 enabled skills).",
		});
		expect(byId.get("audit_persona_ok")).toMatchObject({
			action: "persona",
			result: "succeeded",
			message: "Persona: Deployed to Production VPS.",
		});
		expect(byId.get("audit_persona_fail")).toMatchObject({
			action: "persona",
			result: "failed",
			message: "soul.md write failed",
		});
	});

	it("omits installs with no persisted events", async () => {
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
											id: "install_empty",
											status: "succeeded",
											step: "start-containers",
											createdAt: new Date("2026-05-26T03:00:00.000Z"),
											updatedAt: new Date("2026-05-26T03:05:00.000Z"),
											serverLabel: "Staging VPS",
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
							limit: () => Promise.resolve([]),
						}),
					}),
				};
			}

			if (table === tableAuditLogs) {
				return {
					where: () => ({
						orderBy: () => ({
							limit: () => Promise.resolve([]),
						}),
					}),
				};
			}

			if (table === tableServers) {
				return {
					where: () => Promise.resolve([]),
				};
			}

			throw new Error(`Unexpected table in selectFrom mock: ${String(table)}`);
		});

		const response = await getLogs(createContext());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.logs.installLogs).toEqual([]);
	});

	it("clears persisted action logs and install events", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		selectFrom.mockReturnValueOnce({
			innerJoin: () => ({
				where: () =>
					Promise.resolve([{ id: "install_1" }, { id: "install_2" }]),
			}),
		});

		const response = await clearLogs(createContext());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({ status: "cleared" });
		expect(transaction).toHaveBeenCalledTimes(1);
		expect(deleteWhere).toHaveBeenCalledTimes(2);
	});

	it("limits install events per install instead of using one global cap", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		const eventLimitCalls: number[] = [];
		selectFrom.mockImplementation((table) => {
			if (table === tableInstalls) {
				return {
					innerJoin: () => ({
						where: () => ({
							orderBy: () => ({
								limit: () =>
									Promise.resolve([
										{
											id: "install_a",
											status: "succeeded",
											step: "done",
											createdAt: new Date("2026-06-01T00:00:00.000Z"),
											updatedAt: new Date("2026-06-01T00:05:00.000Z"),
											serverLabel: "A",
										},
										{
											id: "install_b",
											status: "failed",
											step: "done",
											createdAt: new Date("2026-06-02T00:00:00.000Z"),
											updatedAt: new Date("2026-06-02T00:05:00.000Z"),
											serverLabel: "B",
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
							limit: (count: number) => {
								eventLimitCalls.push(count);
								return Promise.resolve([
									{
										installId: "install_a",
										stepName: "install-docker",
										message: "Installing Docker",
										createdAt: new Date("2026-06-01T00:00:00.000Z"),
									},
								]);
							},
						}),
					}),
				};
			}

			if (table === tableAuditLogs) {
				return {
					where: () => ({
						orderBy: () => ({
							limit: () => Promise.resolve([]),
						}),
					}),
				};
			}

			if (table === tableServers) {
				return {
					where: () => Promise.resolve([]),
				};
			}

			throw new Error(`Unexpected table in selectFrom mock: ${String(table)}`);
		});

		const response = await getLogs(createContext());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(eventLimitCalls).toEqual([200, 200]);
		expect(payload.logs.installLogs).toHaveLength(2);
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
