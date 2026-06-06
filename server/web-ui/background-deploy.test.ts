import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	encryptSecret,
	deployManagedCompose,
	insertAuditLog,
	insertValues,
	onConflictDoUpdate,
	transaction,
} = vi.hoisted(() => ({
	encryptSecret: vi.fn(),
	deployManagedCompose: vi.fn(),
	insertAuditLog: vi.fn(),
	insertValues: vi.fn(),
	onConflictDoUpdate: vi.fn(),
	transaction: vi.fn(),
}));

vi.mock("../crypto", () => ({
	encryptSecret,
}));

vi.mock("../managed-compose-deploy", () => ({
	deployManagedCompose,
}));

vi.mock("../lib/insert-audit-log", () => ({
	insertAuditLog,
}));

vi.mock("../db", () => ({
	getDb: () => ({
		insert: () => ({
			values: insertValues,
		}),
		transaction,
	}),
}));

vi.mock("../db/schema", () => ({
	serverWebUi: {
		serverId: Symbol("serverWebUi.serverId"),
	},
}));

import type { OwnedServerSshContext } from "../request-guards";
import { runWebUiDeployInBackground } from "./background-deploy";

const baseCtx = {
	session: {
		user: { id: "user_123" },
		session: { id: "session_123" },
	},
	serverId: "server_123",
	server: {
		host: "203.0.113.10",
		port: 22,
		username: "root",
		hostKeyFingerprint: null,
	},
	authMethod: "password" as const,
	credential: "ssh-secret",
} as OwnedServerSshContext;

describe("runWebUiDeployInBackground", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		encryptSecret.mockImplementation((value: string) => `enc:${value}`);
		insertValues.mockReturnValue({ onConflictDoUpdate });
		onConflictDoUpdate.mockResolvedValue(undefined);
		insertAuditLog.mockResolvedValue(undefined);
		transaction.mockImplementation(async (fn) =>
			fn({ insert: () => ({ values: insertValues }) }),
		);
		deployManagedCompose.mockResolvedValue(undefined);
	});

	it("marks deploy succeeded and writes audit log on success", async () => {
		await runWebUiDeployInBackground({
			ctx: baseCtx,
			password: "generated-password",
			webUiPort: 8787,
			existingEnabled: false,
			ipAddress: "127.0.0.1",
		});

		expect(deployManagedCompose).toHaveBeenCalledWith(
			expect.objectContaining({
				intent: "web-ui",
				serverId: "server_123",
				webUiPassword: "generated-password",
				webUiPort: 8787,
			}),
		);
		expect(transaction).toHaveBeenCalled();
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				serverId: "server_123",
				enabled: true,
				deployStatus: "succeeded",
				deployError: null,
			}),
		);
		expect(insertAuditLog).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: "server.web_ui.deploy.succeeded",
				serverId: "server_123",
			}),
		);
	});

	it("marks deploy failed and writes failure audit log", async () => {
		deployManagedCompose.mockRejectedValue(new Error("SSH timeout"));

		await runWebUiDeployInBackground({
			ctx: baseCtx,
			password: "generated-password",
			webUiPort: 8787,
			existingEnabled: false,
			ipAddress: "127.0.0.1",
		});

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				serverId: "server_123",
				enabled: false,
				deployStatus: "failed",
				deployError: "SSH timeout",
			}),
		);
		expect(insertAuditLog).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: "server.web_ui.deploy.failed",
				details: expect.objectContaining({ error: "SSH timeout" }),
			}),
		);
	});

	it("preserves enabled state when redeploy fails", async () => {
		deployManagedCompose.mockRejectedValue(new Error("Container start failed"));

		await runWebUiDeployInBackground({
			ctx: baseCtx,
			password: "generated-password",
			webUiPort: 8787,
			existingEnabled: true,
			ipAddress: null,
		});

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				enabled: true,
				deployStatus: "failed",
				deployError: "Container start failed",
			}),
		);
	});
});
