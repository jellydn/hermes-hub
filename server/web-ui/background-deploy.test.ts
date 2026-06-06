import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	encryptSecret,
	deployManagedCompose,
	insertAuditLog,
	upsertServerWebUiRecord,
	transaction,
	releaseWebUiDeployLock,
} = vi.hoisted(() => ({
	encryptSecret: vi.fn(),
	deployManagedCompose: vi.fn(),
	insertAuditLog: vi.fn(),
	upsertServerWebUiRecord: vi.fn(),
	transaction: vi.fn(),
	releaseWebUiDeployLock: vi.fn(),
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

vi.mock("./records", () => ({
	upsertServerWebUiRecord,
}));

vi.mock("./deploy-lock", () => ({
	releaseWebUiDeployLock,
}));

vi.mock("../db", () => ({
	getDb: () => ({
		transaction,
	}),
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
		upsertServerWebUiRecord.mockResolvedValue(undefined);
		insertAuditLog.mockResolvedValue(undefined);
		transaction.mockImplementation(async (fn) => fn({}));
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
		expect(upsertServerWebUiRecord).toHaveBeenCalledWith(
			expect.anything(),
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
		expect(releaseWebUiDeployLock).toHaveBeenCalledWith("server_123");
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

		expect(upsertServerWebUiRecord).toHaveBeenCalledWith(
			expect.anything(),
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
		expect(releaseWebUiDeployLock).toHaveBeenCalledWith("server_123");
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

		expect(upsertServerWebUiRecord).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				enabled: true,
				deployStatus: "failed",
				deployError: "Container start failed",
			}),
		);
	});
});
