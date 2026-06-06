import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	encryptSecret,
	dbInsert,
	dbUpdate,
	insertValues,
	updateSet,
	updateWhere,
	updateReturning,
} = vi.hoisted(() => ({
	encryptSecret: vi.fn(),
	dbInsert: vi.fn(),
	dbUpdate: vi.fn(),
	insertValues: vi.fn(),
	updateSet: vi.fn(),
	updateWhere: vi.fn(),
	updateReturning: vi.fn(),
}));

vi.mock("../../crypto", () => ({
	encryptSecret,
}));

vi.mock("../../db", () => ({
	getDb: () => ({
		insert: dbInsert,
		update: dbUpdate,
	}),
}));

import { createMcpServerRecord, updateMcpServerRecord } from "./records";

const baseRecord = {
	id: "mcp_1",
	userId: "user_1",
	name: "github",
	transport: "stdio",
	enabled: true,
	command: "npx",
	args: ["-y", "@modelcontextprotocol/server-github"],
	url: null,
	encryptedEnv: {
		TOKEN: { encrypted: "enc:token", last4: "oken" },
	},
	encryptedHeaders: {
		Authorization: { encrypted: "enc:secret", last4: "cret" },
	},
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

describe("mcp records transport normalization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		encryptSecret.mockImplementation((value: string) => `enc:${value}`);

		dbInsert.mockReturnValue({ values: insertValues });
		insertValues.mockReturnValue({
			returning: vi.fn().mockResolvedValue([baseRecord]),
		});

		dbUpdate.mockReturnValue({ set: updateSet });
		updateSet.mockReturnValue({ where: updateWhere });
		updateWhere.mockReturnValue({ returning: updateReturning });
		updateReturning.mockResolvedValue([
			{
				...baseRecord,
				transport: "http",
				command: null,
				args: [],
				url: "https://mcp.example.com",
				encryptedEnv: {},
				encryptedHeaders: {},
			},
		]);
	});

	it("clears HTTP fields when creating a stdio server", async () => {
		await createMcpServerRecord({ insert: dbInsert } as never, {
			userId: "user_1",
			name: "github",
			transport: "stdio",
			enabled: true,
			command: "npx",
			args: [],
			url: "https://should-be-cleared.example.com",
			env: [{ key: "TOKEN", value: "secret" }],
			headers: [{ key: "Authorization", value: "Bearer secret" }],
			toolsInclude: [],
			toolsExclude: [],
			toolsResources: true,
			toolsPrompts: true,
			timeout: null,
			connectTimeout: null,
			supportsParallelToolCalls: false,
		});

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				transport: "stdio",
				command: "npx",
				url: null,
				encryptedHeaders: {},
			}),
		);
	});

	it("clears stdio fields when switching transport to HTTP", async () => {
		await updateMcpServerRecord({ update: dbUpdate } as never, {
			userId: "user_1",
			serverId: "mcp_1",
			existing: baseRecord,
			name: "github",
			transport: "http",
			enabled: true,
			command: "node",
			args: ["server.js"],
			url: "https://mcp.example.com",
			env: [{ key: "TOKEN", value: "secret" }],
			headers: [{ key: "Authorization", value: "Bearer secret" }],
			toolsInclude: [],
			toolsExclude: [],
			toolsResources: true,
			toolsPrompts: true,
			timeout: null,
			connectTimeout: null,
			supportsParallelToolCalls: false,
		});

		expect(updateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				transport: "http",
				command: null,
				args: [],
				url: "https://mcp.example.com",
				encryptedEnv: {},
			}),
		);
	});
});
