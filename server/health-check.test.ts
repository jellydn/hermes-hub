import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	createOwnedServerRouteContext,
	mockHealthyHealthCheckExec,
	setupOwnedServerRouteMocks,
	sshRouteTestMocks,
} from "./test/ssh-route-test-helpers";

const isContainerRunning = vi.fn();

vi.mock("./auth", () => ({
	getAuthSession: sshRouteTestMocks.getAuthSession,
}));

vi.mock("./credentials", () => ({
	getSessionCredential: sshRouteTestMocks.getSessionCredential,
}));

vi.mock("./crypto", () => ({
	decryptSecret: sshRouteTestMocks.decryptSecret,
}));

vi.mock("./ssh", () => {
	class SshConnectError extends Error {
		constructor(message: string) {
			super(message);
			this.name = "SshConnectError";
		}
	}

	return {
		SshConnectError,
		withSshConnection: sshRouteTestMocks.withSshConnection,
	};
});

vi.mock("./db", () => ({
	getDb: () => ({
		insert: sshRouteTestMocks.dbInsert,
		select: sshRouteTestMocks.dbSelect,
	}),
}));

vi.mock("./hermes/runtime", () => ({
	isContainerRunning,
}));

describe("server health check route", () => {
	beforeEach(() => {
		setupOwnedServerRouteMocks();
		isContainerRunning.mockResolvedValue(true);
		mockHealthyHealthCheckExec();
	});

	it("returns 401 when unauthenticated", async () => {
		sshRouteTestMocks.getAuthSession.mockResolvedValueOnce(null);

		const { runServerHealthCheck } = await import("./health-check/handler");
		const response = await runServerHealthCheck(
			createOwnedServerRouteContext(),
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Unauthorized" });
	});

	it("returns 400 when the server ID is missing", async () => {
		const { runServerHealthCheck } = await import("./health-check/handler");
		const response = await runServerHealthCheck(
			createOwnedServerRouteContext({ serverId: "" }),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Server ID is required",
		});
	});

	it("returns 404 when the server is not found", async () => {
		sshRouteTestMocks.selectLimit.mockResolvedValueOnce([]);

		const { runServerHealthCheck } = await import("./health-check/handler");
		const response = await runServerHealthCheck(
			createOwnedServerRouteContext(),
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Server not found" });
	});

	it("returns 400 when credentials are unavailable", async () => {
		sshRouteTestMocks.decryptSecret.mockImplementationOnce(() => {
			throw new Error("Stored credential is missing.");
		});

		const { runServerHealthCheck } = await import("./health-check/handler");
		const response = await runServerHealthCheck(
			createOwnedServerRouteContext(),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Stored credential is missing.",
		});
		expect(sshRouteTestMocks.insertAuditValues).not.toHaveBeenCalled();
	});

	it("records failed audit logs when SSH fails", async () => {
		const { SshConnectError } = await import("./ssh");
		sshRouteTestMocks.withSshConnection.mockRejectedValueOnce(
			new SshConnectError("Host key mismatch"),
		);

		const { runServerHealthCheck } = await import("./health-check/handler");
		const response = await runServerHealthCheck(
			createOwnedServerRouteContext(),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining("Host key mismatch"),
		});
		expect(sshRouteTestMocks.insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "server.health_check.started",
			}),
		);
		expect(sshRouteTestMocks.insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "server.health_check.failed",
			}),
		);
	});

	it("returns a typed health check result and records success audit logs", async () => {
		const { runServerHealthCheck } = await import("./health-check/handler");
		const response = await runServerHealthCheck(
			createOwnedServerRouteContext(),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.healthCheck).toMatchObject({
			status: "healthy",
			checkedAt: expect.any(String),
			groups: expect.arrayContaining([
				expect.objectContaining({ label: "System" }),
				expect.objectContaining({ label: "Runtime" }),
				expect.objectContaining({ label: "Security posture" }),
			]),
		});
		expect(sshRouteTestMocks.insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "server.health_check.succeeded",
				details: expect.objectContaining({
					status: "healthy",
				}),
			}),
		);
	});
});
