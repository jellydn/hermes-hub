import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditLogs, mcpServers } from "../db/schema";

const getAuthSession = vi.fn();
const requireAuthSession = vi.fn();
const encryptSecret = vi.fn();
const decryptSecret = vi.fn();
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
const readHermesConfigYaml = vi.fn();
const writeHermesConfigYaml = vi.fn();
const restartGateway = vi.fn();
const resolveHermesDeployContext = vi.fn();

vi.mock("../auth", () => ({
	getAuthSession,
}));

vi.mock("../crypto", () => ({
	encryptSecret,
	decryptSecret,
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

vi.mock("../ssh", () => ({
	withSshConnection,
}));

vi.mock("../hermes/mcp-config", () => ({
	readHermesConfigYaml,
	writeHermesConfigYaml,
}));

vi.mock("../hermes/runtime", () => ({
	restartGateway,
}));

vi.mock("../hermes/deploy-context", () => ({
	resolveHermesDeployContext,
}));

const baseRecord = {
	id: "mcp_1",
	userId: "user_123",
	name: "github",
	transport: "stdio",
	enabled: true,
	command: "npx",
	args: ["-y", "@modelcontextprotocol/server-github"],
	url: null,
	encryptedEnv: {
		GITHUB_PERSONAL_ACCESS_TOKEN: {
			encrypted: "enc:token1234",
			last4: "1234",
		},
	},
	encryptedHeaders: {},
	toolsInclude: [],
	toolsExclude: [],
	toolsResources: true,
	toolsPrompts: true,
	timeout: null,
	connectTimeout: null,
	supportsParallelToolCalls: false,
	createdAt: new Date("2026-06-06T12:00:00.000Z"),
	updatedAt: new Date("2026-06-06T12:00:00.000Z"),
};

describe("mcp settings", () => {
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
		encryptSecret.mockImplementation((value: string) => `enc:${value}`);

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({
			orderBy: selectOrderBy,
			limit: selectLimit,
		});
		selectOrderBy.mockReturnValue([]);
		selectLimit.mockResolvedValue([]);

		dbInsert.mockImplementation((table) => {
			if (table === mcpServers) {
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
		updateReturning.mockResolvedValue([
			{
				...baseRecord,
				command: "node",
			},
		]);

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

		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: {
					execCommand: () => Promise<unknown>;
				}) => Promise<void>,
			) => callback({ execCommand: vi.fn() }),
		);
		readHermesConfigYaml.mockResolvedValue("model: gpt-4o-mini\n");
		writeHermesConfigYaml.mockResolvedValue(undefined);
		restartGateway.mockResolvedValue("restarted");
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
	});

	it("creates a stdio MCP server with encrypted env values", async () => {
		selectLimit.mockResolvedValueOnce([]);

		const { createMcpServer } = await import("./mcp");
		const response = await createMcpServer(
			createContext({
				name: "github",
				transport: "stdio",
				command: "npx",
				args: ["-y", "@modelcontextprotocol/server-github"],
				env: [{ key: "GITHUB_PERSONAL_ACCESS_TOKEN", value: "ghp_secret1234" }],
			}),
		);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.server.name).toBe("github");
		expect(payload.server.env).toEqual([
			{
				key: "GITHUB_PERSONAL_ACCESS_TOKEN",
				valueLast4: "1234",
				hasStoredValue: true,
			},
		]);
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "mcp_server.created",
			}),
		);
	});

	it("returns 400 when update adds a new env key without a value", async () => {
		selectLimit.mockResolvedValueOnce([baseRecord]);

		const { updateMcpServer } = await import("./mcp");
		const response = await updateMcpServer(
			createContext(
				{
					env: [{ key: "NEW_TOKEN", value: "" }],
				},
				"PUT",
				"mcp_1",
			),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: 'Environment variable value is required for new key "NEW_TOKEN".',
		});
		expect(updateReturning).not.toHaveBeenCalled();
	});

	it("preserves encrypted env values when update leaves secrets blank", async () => {
		selectLimit.mockResolvedValueOnce([baseRecord]);

		const { updateMcpServer } = await import("./mcp");
		const response = await updateMcpServer(
			createContext(
				{
					command: "node",
					env: [{ key: "GITHUB_PERSONAL_ACCESS_TOKEN", value: "" }],
				},
				"PUT",
				"mcp_1",
			),
		);

		expect(response.status).toBe(200);
		expect(updateReturning).toHaveBeenCalled();
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "mcp_server.updated",
			}),
		);
	});

	it("deletes an owned MCP server", async () => {
		selectLimit.mockResolvedValueOnce([baseRecord]); // pre-check for getOwnedMcpServerRecord

		const { deleteMcpServer } = await import("./mcp");
		const response = await deleteMcpServer(
			createContext(null, "DELETE", "mcp_1"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: "deleted",
			id: "mcp_1",
		});
	});

	it("deploys MCP settings over SSH and records success audit logs", async () => {
		selectOrderBy.mockResolvedValueOnce([baseRecord]);

		const { deployMcpServersToHermes } = await import("./mcp");
		const response = await deployMcpServersToHermes(
			createContext(null, "POST"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "deployed",
			serverId: "server_1",
			serverHost: "1.2.3.4",
		});
		expect(writeHermesConfigYaml).toHaveBeenCalled();
		expect(restartGateway).toHaveBeenCalled();
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "mcp.deployed",
			}),
		);
	});

	it("passes the selected serverId to the deploy resolver", async () => {
		selectOrderBy.mockResolvedValueOnce([baseRecord]);

		const { deployMcpServersToHermes } = await import("./mcp");
		const response = await deployMcpServersToHermes(
			createContext({ serverId: "server_2" }, "POST"),
		);

		expect(response.status).toBe(200);
		expect(resolveHermesDeployContext).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				user: expect.objectContaining({ id: "user_123" }),
			}),
			"server_2",
		);
	});

	it("returns 400 when create hits a unique name constraint", async () => {
		selectLimit.mockResolvedValueOnce([]);
		insertValues.mockReturnValueOnce({
			returning: vi.fn().mockRejectedValue({ code: "23505" }),
		});

		const { createMcpServer } = await import("./mcp");
		const response = await createMcpServer(
			createContext({
				name: "github",
				transport: "stdio",
				command: "npx",
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "An MCP server with this name already exists.",
		});
	});

	it("returns 502 without writing remote config when existing YAML is invalid", async () => {
		selectOrderBy.mockResolvedValueOnce([baseRecord]);
		readHermesConfigYaml.mockResolvedValueOnce("model: [broken");

		const { deployMcpServersToHermes } = await import("./mcp");
		const response = await deployMcpServersToHermes(
			createContext(null, "POST"),
		);

		expect(response.status).toBe(502);
		expect(writeHermesConfigYaml).not.toHaveBeenCalled();
		expect(restartGateway).not.toHaveBeenCalled();
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "mcp.deploy.failed",
			}),
		);
	});

	it("returns 502 and records deploy failure when SSH write fails", async () => {
		selectOrderBy.mockResolvedValueOnce([baseRecord]);
		writeHermesConfigYaml.mockRejectedValueOnce(new Error("SSH write failed"));

		const { deployMcpServersToHermes } = await import("./mcp");
		const response = await deployMcpServersToHermes(
			createContext(null, "POST"),
		);

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: "Deploy failed: SSH write failed",
		});
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "mcp.deploy.failed",
			}),
		);
	});
});

function createContext(body: unknown, method = "POST", id?: string) {
	const url = id
		? `http://localhost/api/settings/mcp-servers/${id}`
		: "http://localhost/api/settings/mcp-servers";

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
