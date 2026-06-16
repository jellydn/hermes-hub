import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	createContext,
	dbDelete,
	dbInsert,
	dbSelect,
	dbUpdate,
	encryptSecret,
	getAuthSession,
	insertAuditValues,
	insertValues,
	requireAuthSession,
	selectLimit,
	setupMcpMocks,
	transaction,
} from "./test-helpers";

vi.mock("../../auth", () => ({
	getAuthSession,
}));

vi.mock("../../crypto", () => ({
	encryptSecret,
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

describe("mcp create", () => {
	beforeEach(() => {
		setupMcpMocks();
	});

	it("creates a stdio MCP server with encrypted env values", async () => {
		selectLimit.mockResolvedValueOnce([]);

		const { createMcpServer } = await import("../mcp");
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

	it("returns 400 when create hits a unique name constraint", async () => {
		selectLimit.mockResolvedValueOnce([]);
		insertValues.mockReturnValueOnce({
			returning: vi.fn().mockRejectedValue({ code: "23505" }),
		});

		const { createMcpServer } = await import("../mcp");
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
});
