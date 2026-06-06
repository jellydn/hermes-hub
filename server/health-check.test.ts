import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthSession = vi.fn();
const getSessionCredential = vi.fn();
const decryptSecret = vi.fn();
const withSshConnection = vi.fn();
const dbInsert = vi.fn();
const dbSelect = vi.fn();
const insertAuditValues = vi.fn();
const selectFrom = vi.fn();
const selectWhere = vi.fn();
const selectLimit = vi.fn();

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./credentials", () => ({
	getSessionCredential,
}));

vi.mock("./crypto", () => ({
	decryptSecret,
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
		withSshConnection,
	};
});

vi.mock("./db", () => ({
	getDb: () => ({
		insert: dbInsert,
		select: dbSelect,
	}),
}));

function mockHealthySshExec() {
	withSshConnection.mockImplementation(async (_input, run) => {
		const execCommand = vi.fn(async (command: string) => {
			if (command.includes("uptime")) {
				return { code: 0, stdout: "up 2 days", stderr: "" };
			}
			if (command.includes("top -bn1")) {
				return { code: 0, stdout: "24", stderr: "" };
			}
			if (command.includes("free |")) {
				return { code: 0, stdout: "42", stderr: "" };
			}
			if (command.includes("df -P /")) {
				return { code: 0, stdout: "55", stderr: "" };
			}
			if (command.includes("command -v docker")) {
				return { code: 0, stdout: "yes", stderr: "" };
			}
			if (command.includes("docker info")) {
				return { code: 0, stdout: "yes", stderr: "" };
			}
			if (command.includes("docker ps --filter")) {
				return { code: 0, stdout: "hermes", stderr: "" };
			}
			if (command.includes("passwordauthentication")) {
				return { code: 0, stdout: "no", stderr: "" };
			}
			if (command.includes("permitrootlogin")) {
				return { code: 0, stdout: "no", stderr: "" };
			}
			if (command.includes("ufw status") || command.includes("firewall-cmd")) {
				return { code: 0, stdout: "Status: active", stderr: "" };
			}
			if (command.includes("apt-get") || command.includes("dnf updateinfo")) {
				return { code: 0, stdout: "0", stderr: "" };
			}
			if (command.includes("curl -s -o /dev/null")) {
				return { code: 0, stdout: "200", stderr: "" };
			}

			return { code: 0, stdout: "", stderr: "" };
		});

		return run({ execCommand });
	});
}

describe("server health check route", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		getAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});

		dbInsert.mockReturnValue({ values: insertAuditValues });
		insertAuditValues.mockResolvedValue(undefined);

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({ limit: selectLimit });
		selectLimit.mockResolvedValue([
			{
				id: "server_123",
				label: "Prod VPS",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "password",
				encryptedCredential: "encrypted-secret",
				storeCredential: true,
				status: "connected",
				osInfo: {
					name: "Ubuntu",
					version: "24.04",
					architecture: "x86_64",
				},
				hostKeyFingerprint: "SHA256:abc",
			},
		]);

		decryptSecret.mockReturnValue("secret");
		mockHealthySshExec();
	});

	it("returns 401 when unauthenticated", async () => {
		getAuthSession.mockResolvedValueOnce(null);

		const { runServerHealthCheck } = await import("./health-check");
		const response = await runServerHealthCheck(createContext());

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Unauthorized" });
	});

	it("returns 400 when the server ID is missing", async () => {
		const { runServerHealthCheck } = await import("./health-check");
		const response = await runServerHealthCheck(createContext({ id: "" }));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Server ID is required",
		});
	});

	it("returns 404 when the server is not found", async () => {
		selectLimit.mockResolvedValueOnce([]);

		const { runServerHealthCheck } = await import("./health-check");
		const response = await runServerHealthCheck(createContext());

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Server not found" });
	});

	it("returns 400 when credentials are unavailable", async () => {
		decryptSecret.mockImplementationOnce(() => {
			throw new Error("Stored credential is missing.");
		});

		const { runServerHealthCheck } = await import("./health-check");
		const response = await runServerHealthCheck(createContext());

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Stored credential is missing.",
		});
		expect(insertAuditValues).not.toHaveBeenCalled();
	});

	it("records failed audit logs when SSH fails", async () => {
		const { SshConnectError } = await import("./ssh");
		withSshConnection.mockRejectedValueOnce(
			new SshConnectError("Host key mismatch"),
		);

		const { runServerHealthCheck } = await import("./health-check");
		const response = await runServerHealthCheck(createContext());

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining("Host key mismatch"),
		});
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "server.health_check.started",
			}),
		);
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "server.health_check.failed",
			}),
		);
	});

	it("returns a typed health check result and records success audit logs", async () => {
		const { runServerHealthCheck } = await import("./health-check");
		const response = await runServerHealthCheck(createContext());

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
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "server.health_check.succeeded",
				details: expect.objectContaining({
					status: "healthy",
				}),
			}),
		);
	});
});

function createContext(options?: { id?: string }) {
	const serverId = options?.id ?? "server_123";

	return {
		req: {
			raw: new Request(
				`http://localhost/api/servers/${serverId}/health-check`,
				{
					method: "POST",
				},
			),
			header: () => null,
			param: (name: string) =>
				name === "id" ? serverId || undefined : undefined,
		},
		json: (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as never;
}
