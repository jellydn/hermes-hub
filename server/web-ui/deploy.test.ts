import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	encryptSecret,
	decryptSecret,
	deployManagedCompose,
	getLatestInstallForServer,
	getResolvedServerWebUiRecord,
	upsertServerWebUiRecord,
	insertAuditLog,
	invalidatePooledSsh,
	tryAcquireWebUiDeployLock,
	releaseWebUiDeployLock,
	transaction,
} = vi.hoisted(() => ({
	encryptSecret: vi.fn(),
	decryptSecret: vi.fn(),
	deployManagedCompose: vi.fn(),
	getLatestInstallForServer: vi.fn(),
	getResolvedServerWebUiRecord: vi.fn(),
	upsertServerWebUiRecord: vi.fn(),
	insertAuditLog: vi.fn(),
	invalidatePooledSsh: vi.fn(),
	tryAcquireWebUiDeployLock: vi.fn(),
	releaseWebUiDeployLock: vi.fn(),
	transaction: vi.fn(),
}));

vi.mock("../crypto", () => ({
	encryptSecret,
}));

vi.mock("../managed-compose-deploy", () => ({
	deployManagedCompose,
}));

vi.mock("../install/records", () => ({
	getLatestInstallForServer,
}));

vi.mock("../lib/insert-audit-log", () => ({
	insertAuditLog,
}));

vi.mock("./records", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./records")>();
	return {
		...actual,
		getResolvedServerWebUiRecord,
		getServerWebUiRecord: getResolvedServerWebUiRecord,
		upsertServerWebUiRecord,
		decryptWebUiPassword: (value: string | null) =>
			value ? decryptSecret(value) : null,
	};
});

vi.mock("./deploy-lock", () => ({
	tryAcquireWebUiDeployLock,
	releaseWebUiDeployLock,
}));

vi.mock("./ssh-pool", () => ({
	invalidatePooledSsh,
}));

vi.mock("../db", () => ({
	getDb: () => ({
		transaction,
	}),
}));

import type { OwnedServerSshContext } from "../request-guards";
import { getStatus, startDeploy } from "./deploy";

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

describe("startDeploy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		encryptSecret.mockImplementation((value: string) => `enc:${value}`);
		decryptSecret.mockImplementation((value: string) =>
			value.startsWith("enc:") ? value.slice(4) : value,
		);
		deployManagedCompose.mockResolvedValue(undefined);
		getLatestInstallForServer.mockResolvedValue({ status: "succeeded" });
		getResolvedServerWebUiRecord.mockResolvedValue(null);
		upsertServerWebUiRecord.mockResolvedValue(undefined);
		insertAuditLog.mockResolvedValue(undefined);
		invalidatePooledSsh.mockReturnValue(undefined);
		tryAcquireWebUiDeployLock.mockReturnValue(true);
		transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) =>
			fn({}),
		);
	});

	it("rejects deploy when install is missing", async () => {
		getLatestInstallForServer.mockResolvedValue(null);

		await expect(startDeploy(baseCtx, "127.0.0.1")).rejects.toMatchObject({
			statusCode: 400,
			message: expect.stringMatching(/install hermes/i),
		});
	});

	it("rejects deploy when install failed", async () => {
		getLatestInstallForServer.mockResolvedValueOnce({ status: "failed" });

		await expect(startDeploy(baseCtx, "127.0.0.1")).rejects.toMatchObject({
			statusCode: 400,
			message: expect.stringMatching(/did not succeed/i),
		});
	});

	it("returns 202 deploying status on first deploy", async () => {
		deployManagedCompose.mockReturnValue(new Promise(() => {}));

		const result = await startDeploy(baseCtx, "127.0.0.1");

		expect(result.status).toBe("deploying");
		expect(result.webUi.deployStatus).toBe("deploying");
		expect(result.webUi.enabled).toBe(false);
		expect(invalidatePooledSsh).toHaveBeenCalledWith("user_123", "server_123");
		expect(upsertServerWebUiRecord).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				serverId: "server_123",
				deployStatus: "deploying",
				deployError: null,
			}),
		);
	});

	it("preserves enabled state on redeploy", async () => {
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:existing-password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});
		deployManagedCompose.mockReturnValue(new Promise(() => {}));

		const result = await startDeploy(baseCtx, "127.0.0.1");

		expect(result.webUi.enabled).toBe(true);
		expect(upsertServerWebUiRecord).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				enabled: true,
				deployStatus: "deploying",
			}),
		);
	});

	it("returns 202 when already deploying", async () => {
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: false,
			encryptedPassword: "enc:password",
			port: 8787,
			deployStatus: "deploying",
			deployError: null,
			deployStartedAt: new Date(),
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		const result = await startDeploy(baseCtx, "127.0.0.1");

		expect(result.status).toBe("deploying");
		expect(upsertServerWebUiRecord).not.toHaveBeenCalled();
	});

	it("returns 202 when lock cannot be acquired (deploy in progress elsewhere)", async () => {
		tryAcquireWebUiDeployLock.mockReturnValue(false);
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		const result = await startDeploy(baseCtx, "127.0.0.1");

		expect(result.status).toBe("deploying");
		expect(upsertServerWebUiRecord).not.toHaveBeenCalled();
	});

	it("throws on password decrypt failure", async () => {
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: false,
			encryptedPassword: "corrupt",
			port: 8787,
			deployStatus: "idle",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});
		decryptSecret.mockReturnValue(null);

		await expect(startDeploy(baseCtx, "127.0.0.1")).rejects.toMatchObject({
			statusCode: 500,
			message: expect.stringMatching(/could not be decrypted/i),
		});
		expect(releaseWebUiDeployLock).toHaveBeenCalledWith("server_123");
	});

	it("releases lock when upsert fails during deploying transition", async () => {
		upsertServerWebUiRecord.mockRejectedValueOnce(new Error("DB write error"));

		await expect(startDeploy(baseCtx, "127.0.0.1")).rejects.toThrow(
			"DB write error",
		);
		expect(releaseWebUiDeployLock).toHaveBeenCalledWith("server_123");
	});

	it("starts a fresh deploy when the previous deploy failed", async () => {
		// records.ts resolved a stale deploying→failed record before we see it
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: false,
			encryptedPassword: "enc:old-password",
			port: 8787,
			deployStatus: "failed",
			deployError: "Web UI deploy timed out.",
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});
		deployManagedCompose.mockReturnValue(new Promise(() => {}));

		const result = await startDeploy(baseCtx, "127.0.0.1");

		expect(result.status).toBe("deploying");
		expect(upsertServerWebUiRecord).toHaveBeenCalled();
	});

	it("passes correct params to deployManagedCompose via background work", async () => {
		await startDeploy(baseCtx, "127.0.0.1");

		await vi.waitFor(() => {
			expect(deployManagedCompose).toHaveBeenCalled();
		});

		expect(deployManagedCompose).toHaveBeenCalledWith(
			expect.objectContaining({
				intent: "web-ui",
				userId: "user_123",
				serverId: "server_123",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "password",
				credential: "ssh-secret",
				webUiPort: 8787,
			}),
		);
	});

	it("handles non-Error deployManagedCompose rejections in background", async () => {
		deployManagedCompose.mockRejectedValue("Network failure");

		await startDeploy(baseCtx, "127.0.0.1");

		await vi.waitFor(() => {
			expect(upsertServerWebUiRecord).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					deployStatus: "failed",
					deployError: "Deploy failed",
				}),
			);

			expect(releaseWebUiDeployLock).toHaveBeenCalledWith("server_123");
		});
	});

	it("marks deploy succeeded in background", async () => {
		await startDeploy(baseCtx, "127.0.0.1");

		// Wait for the background promise to settle
		await vi.waitFor(() => {
			expect(upsertServerWebUiRecord).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
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
	});

	it("marks deploy failed in background and preserves enabled state", async () => {
		deployManagedCompose.mockRejectedValue(new Error("SSH timeout"));

		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		await startDeploy(baseCtx, "127.0.0.1");

		await vi.waitFor(() => {
			expect(upsertServerWebUiRecord).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					enabled: true,
					deployStatus: "failed",
					deployError: "SSH timeout",
				}),
			);

			expect(releaseWebUiDeployLock).toHaveBeenCalledWith("server_123");
		});
	});
});

describe("getStatus", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns null when no record exists", async () => {
		getResolvedServerWebUiRecord.mockResolvedValue(null);

		const result = await getStatus("server_123");
		expect(result).toBeNull();
	});

	it("returns snapshot for existing record", async () => {
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		const result = await getStatus("server_123");
		expect(result?.deployStatus).toBe("succeeded");
		expect(result?.enabled).toBe(true);
	});
});
