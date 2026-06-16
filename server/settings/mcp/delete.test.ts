import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	baseRecord,
	createContext,
	dbDelete,
	dbInsert,
	dbSelect,
	getAuthSession,
	requireAuthSession,
	selectLimit,
	setupMcpMocks,
	transaction,
} from "./test-helpers";

vi.mock("../../auth", () => ({
	getAuthSession,
}));

vi.mock("../../db", () => ({
	getDb: () => ({
		select: dbSelect,
		insert: dbInsert,
		delete: dbDelete,
		transaction,
	}),
}));

vi.mock("../../request-guards", () => ({
	requireAuthSession,
}));

describe("mcp delete", () => {
	beforeEach(() => {
		setupMcpMocks();
	});

	it("deletes an owned MCP server", async () => {
		selectLimit.mockResolvedValueOnce([baseRecord]); // pre-check for getOwnedMcpServerRecord

		const { deleteMcpServer } = await import("../mcp");
		const response = await deleteMcpServer(
			createContext(null, "DELETE", "mcp_1"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: "deleted",
			id: "mcp_1",
		});
	});
});
