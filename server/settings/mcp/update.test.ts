import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	baseRecord,
	createContext,
	dbDelete,
	dbInsert,
	dbSelect,
	dbUpdate,
	encryptSecret,
	getAuthSession,
	insertAuditValues,
	requireAuthSession,
	selectLimit,
	setupMcpMocks,
	transaction,
	updateReturning,
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

describe("mcp update", () => {
	beforeEach(() => {
		setupMcpMocks();
	});

	it("returns 400 when update adds a new env key without a value", async () => {
		selectLimit.mockResolvedValueOnce([baseRecord]);

		const { updateMcpServer } = await import("../mcp");
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

		const { updateMcpServer } = await import("../mcp");
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
});
