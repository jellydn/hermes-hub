import { vi } from "vitest";

import { auditLogs, mcpServers } from "../../db/schema";

export const getAuthSession = vi.fn();
export const requireAuthSession = vi.fn();
export const encryptSecret = vi.fn();
export const decryptSecret = vi.fn();
export const dbSelect = vi.fn();
export const dbInsert = vi.fn();
export const dbUpdate = vi.fn();
export const dbDelete = vi.fn();
export const transaction = vi.fn();
export const selectFrom = vi.fn();
export const selectWhere = vi.fn();
export const selectOrderBy = vi.fn();
export const selectLimit = vi.fn();
export const insertValues = vi.fn();
export const updateSet = vi.fn();
export const updateWhere = vi.fn();
export const updateReturning = vi.fn();
export const deleteWhere = vi.fn();
export const deleteReturning = vi.fn();
export const insertAuditValues = vi.fn();
export const withSshConnection = vi.fn();
export const readHermesConfigYaml = vi.fn();
export const writeHermesConfigYaml = vi.fn();
export const restartGateway = vi.fn();
export const resolveHermesDeployContext = vi.fn();

export const baseRecord = {
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

export function setupMcpMocks() {
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
			callback: (ssh: { execCommand: () => Promise<unknown> }) => Promise<void>,
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
}

export function createContext(body: unknown, method = "POST", id?: string) {
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
