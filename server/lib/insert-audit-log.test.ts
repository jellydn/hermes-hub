import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InsertAuditLogInput } from "./insert-audit-log";

const insertValues = vi.fn();
const dbInsert = vi.fn();

vi.mock("../db", () => ({
	getDb: () => ({
		insert: dbInsert,
	}),
}));

vi.mock("../db/schema", () => ({
	auditLogs: { __table: "audit_logs" },
}));

describe("insertAuditLog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		dbInsert.mockReturnValue({ values: insertValues });
		insertValues.mockResolvedValue(undefined);
	});

	it("writes serverId from the explicit parameter when provided", async () => {
		const { insertAuditLog } = await import("./insert-audit-log");
		await insertAuditLog({ insert: dbInsert } as never, {
			userId: "user_123",
			action: "server.connect.succeeded",
			serverId: "server_abc",
			details: { host: "203.0.113.10" },
			ipAddress: "10.0.0.1",
		} satisfies InsertAuditLogInput);

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user_123",
				action: "server.connect.succeeded",
				serverId: "server_abc",
				ipAddress: "10.0.0.1",
				details: { host: "203.0.113.10" },
			}),
		);
	});

	it("derives serverId from details.serverId when not explicit", async () => {
		const { insertAuditLog } = await import("./insert-audit-log");
		await insertAuditLog({ insert: dbInsert } as never, {
			userId: "user_123",
			action: "server.update.succeeded",
			details: { serverId: "server_xyz", host: "198.51.100.25" },
			ipAddress: null,
		} satisfies InsertAuditLogInput);

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user_123",
				action: "server.update.succeeded",
				serverId: "server_xyz",
				ipAddress: null,
			}),
		);
	});

	it("writes null serverId when neither the parameter nor details carry one", async () => {
		const { insertAuditLog } = await import("./insert-audit-log");
		await insertAuditLog({ insert: dbInsert } as never, {
			userId: "user_123",
			action: "telegram.connected",
			details: { botUsername: "hermes" },
			ipAddress: "10.0.0.1",
		} satisfies InsertAuditLogInput);

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				serverId: null,
				details: { botUsername: "hermes" },
			}),
		);
	});
});
