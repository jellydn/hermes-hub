import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, installs } from "./db/schema";

const getAuthSession = vi.fn();
const getEphemeralCredential = vi.fn();
const decryptSecret = vi.fn();
const withSshConnection = vi.fn();
const insertInstallValues = vi.fn();
const insertInstallReturning = vi.fn();
const insertAuditValues = vi.fn();
const updateInstallSet = vi.fn();
const updateInstallWhere = vi.fn();
const selectFrom = vi.fn();
const selectWhere = vi.fn();
const selectOrderBy = vi.fn();
const selectLimit = vi.fn();
const dbInsert = vi.fn();
const dbSelect = vi.fn();
const dbUpdate = vi.fn();

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./credentials", () => ({
	getEphemeralCredential,
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
		update: dbUpdate,
	}),
}));

describe("server install", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		getAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});

		dbInsert.mockImplementation((table) => {
			if (table === installs) {
				return {
					values: insertInstallValues,
				};
			}

			if (table === auditLogs) {
				return {
					values: insertAuditValues,
				};
			}

			throw new Error("Unexpected table insert");
		});

		insertInstallValues.mockReturnValue({
			returning: insertInstallReturning,
		});
		insertInstallReturning.mockResolvedValue([{ id: "install_123" }]);
		insertAuditValues.mockResolvedValue(undefined);

		dbSelect.mockReturnValue({
			from: selectFrom,
		});
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({ orderBy: selectOrderBy, limit: selectLimit });
		selectOrderBy.mockReturnValue({ limit: selectLimit });

		selectLimit
			.mockResolvedValueOnce([
				{
					id: "server_123",
					host: "203.0.113.10",
					port: 22,
					username: "root",
					authMethod: "password",
					encryptedCredential: "encrypted-secret",
					storeCredential: true,
				},
			])
			.mockResolvedValueOnce([]);

		decryptSecret.mockReturnValue("secret");
		getEphemeralCredential.mockReturnValue(null);

		updateInstallWhere.mockResolvedValue([{ id: "install_123" }]);
		updateInstallSet.mockReturnValue({ where: updateInstallWhere });
		dbUpdate.mockReturnValue({ set: updateInstallSet });

		withSshConnection.mockImplementation(async (_input, run) => {
			const execCommand = vi
				.fn()
				.mockResolvedValue({ code: 0, stdout: "ok", stderr: "" });
			return run({ execCommand });
		});
	});

	it("starts an install using stored credentials", async () => {
		const { startServerInstall } = await import("./install");
		const response = await startServerInstall(createContext("POST"));

		expect(response.status).toBe(202);
		expect(await response.json()).toMatchObject({
			install: {
				id: "install_123",
				serverId: "server_123",
				status: "pending",
			},
		});
		expect(decryptSecret).toHaveBeenCalledWith("encrypted-secret");
		expect(withSshConnection).toHaveBeenCalled();
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "server.install.started",
			}),
		);
	});

	it("returns a validation error when ephemeral credentials are unavailable", async () => {
		selectLimit.mockReset();
		selectLimit.mockResolvedValueOnce([
			{
				id: "server_123",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "ssh-key",
				encryptedCredential: null,
				storeCredential: false,
			},
		]);

		const { startServerInstall } = await import("./install");
		const response = await startServerInstall(createContext("POST"));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Temporary credential expired. Reconnect the server first.",
		});
		expect(withSshConnection).not.toHaveBeenCalled();
	});

	it("replays persisted install events over SSE", async () => {
		selectLimit.mockReset();
		selectLimit.mockResolvedValueOnce([
			{
				id: "server_123",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "password",
				encryptedCredential: "encrypted-secret",
				storeCredential: true,
			},
		]);
		selectLimit.mockResolvedValueOnce([
			{
				id: "install_123",
				status: "failed",
				step: "failed",
				log: "2026-05-26T10:40:00.000Z [install-docker] Installing Docker",
			},
		]);

		const { streamServerInstallEvents } = await import("./install");
		const response = await streamServerInstallEvents(createContext("GET"));

		expect(response.headers.get("content-type")).toContain("text/event-stream");
		const body = await response.text();
		expect(body).toContain("install-progress");
		expect(body).toContain("Installing Docker");
	});

	it("returns an error when stored credential data is missing", async () => {
		selectLimit.mockReset();
		selectLimit.mockResolvedValueOnce([
			{
				id: "server_123",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "password",
				encryptedCredential: null,
				storeCredential: true,
			},
		]);

		const { startServerInstall } = await import("./install");
		const response = await startServerInstall(createContext("POST"));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Stored credential is missing",
		});
		expect(withSshConnection).not.toHaveBeenCalled();
	});

	it("returns an error for unsupported authentication methods", async () => {
		selectLimit.mockReset();
		selectLimit.mockResolvedValueOnce([
			{
				id: "server_123",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "invalid-key",
				encryptedCredential: null,
				storeCredential: false,
			},
		]);

		const { startServerInstall } = await import("./install");
		const response = await startServerInstall(createContext("POST"));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Unsupported authentication method",
		});
		expect(withSshConnection).not.toHaveBeenCalled();
	});

	it("writes a failed audit log when an SSH command returns a non-zero exit code", async () => {
		withSshConnection.mockImplementation(async (_input, run) => {
			const execCommand = vi.fn().mockResolvedValue({
				code: 1,
				stdout: "",
				stderr: "Docker not available",
			});
			return run({ execCommand });
		});

		const { startServerInstall } = await import("./install");
		const response = await startServerInstall(createContext("POST"));

		expect(response.status).toBe(202);

		// flush microtasks so runInstallWorkflow completes
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "server.install.failed",
			}),
		);
	});

	it("writes a failed audit log when SSH connection itself errors", async () => {
		const { SshConnectError } = await import("./ssh");
		withSshConnection.mockRejectedValue(
			new SshConnectError("Connection refused"),
		);

		const { startServerInstall } = await import("./install");
		const response = await startServerInstall(createContext("POST"));

		expect(response.status).toBe(202);

		// flush microtasks so runInstallWorkflow completes
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "server.install.failed",
			}),
		);
	});
});

function createContext(method: "GET" | "POST") {
	const headers = new Headers();

	return {
		req: {
			raw: new Request(
				`http://localhost/api/servers/server_123/install${method === "GET" ? "/events" : ""}`,
				{
					method,
				},
			),
			header: () => null,
			param: (name: string) => (name === "id" ? "server_123" : undefined),
		},
		header: (name: string, value: string) => {
			headers.set(name, value);
		},
		newResponse: (body: BodyInit | null) =>
			new Response(body, {
				status: 200,
				headers,
			}),
		json: (payload: unknown, status = 200) =>
			new Response(JSON.stringify(payload), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as never;
}
