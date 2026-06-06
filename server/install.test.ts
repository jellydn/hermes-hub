import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditLogs, installEvents, installs, servers } from "./db/schema";
import { installStreams } from "./install/sse-stream";

const getAuthSession = vi.fn();
const getSessionCredential = vi.fn();
const decryptSecret = vi.fn();
const withSshConnection = vi.fn();
const insertInstallValues = vi.fn();
const insertInstallReturning = vi.fn();
const insertAuditValues = vi.fn();
const insertInstallEventValues = vi.fn();
const updateInstallSet = vi.fn();
const updateInstallWhere = vi.fn();
const dbInsert = vi.fn();
const dbSelect = vi.fn();
const dbUpdate = vi.fn();

let serverSelectResults: Array<unknown[]> = [];
let installLimitResults: Array<unknown[]> = [];
let installEventResults: Array<unknown[]> = [];

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
		update: dbUpdate,
		transaction: (callback: (tx: unknown) => Promise<unknown>) =>
			callback({
				insert: dbInsert,
				update: dbUpdate,
			}),
	}),
}));

describe("server install", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installStreams.clear();

		serverSelectResults = [[defaultServerRecord()]];
		installLimitResults = [[]];
		installEventResults = [[]];

		getAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});

		dbInsert.mockImplementation((table: unknown) => {
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

			if (table === installEvents) {
				return {
					values: insertInstallEventValues,
				};
			}

			throw new Error("Unexpected table insert");
		});

		insertInstallValues.mockReturnValue({
			returning: insertInstallReturning,
		});
		insertInstallReturning.mockResolvedValue([{ id: "install_123" }]);
		insertAuditValues.mockResolvedValue(undefined);
		insertInstallEventValues.mockResolvedValue(undefined);

		dbSelect.mockImplementation(() => ({
			from: (table: unknown) => {
				if (table === servers) {
					return {
						where: () => ({
							limit: async () => serverSelectResults.shift() ?? [],
						}),
					};
				}

				if (table === installs) {
					return {
						where: () => ({
							orderBy: () => ({
								limit: async () => installLimitResults.shift() ?? [],
							}),
						}),
					};
				}

				if (table === installEvents) {
					return {
						where: () => ({
							orderBy: async () => installEventResults.shift() ?? [],
						}),
					};
				}

				throw new Error("Unexpected table select");
			},
		}));

		updateInstallWhere.mockResolvedValue([{ id: "install_123" }]);
		updateInstallSet.mockReturnValue({ where: updateInstallWhere });
		dbUpdate.mockImplementation((table: unknown) => {
			if (table === installs) {
				return { set: updateInstallSet };
			}

			throw new Error("Unexpected table update");
		});

		decryptSecret.mockReturnValue("secret");
		getSessionCredential.mockReturnValue(null);

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
		serverSelectResults = [
			[
				{
					...defaultServerRecord(),
					authMethod: "ssh-key",
					encryptedCredential: null,
					storeCredential: false,
				},
			],
		];

		const { startServerInstall } = await import("./install");
		const response = await startServerInstall(createContext("POST"));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Temporary credential expired. Reconnect the server first.",
		});
		expect(withSshConnection).not.toHaveBeenCalled();
	});

	it("replays persisted install events over SSE", async () => {
		serverSelectResults = [[defaultServerRecord()]];
		installLimitResults = [
			[
				{
					id: "install_123",
					status: "failed",
					step: "failed",
				},
			],
		];
		installEventResults = [
			[
				{
					installId: "install_123",
					step: "install-docker",
					progress: 15,
					message: "Installing Docker",
					status: "failed",
					timestamp: new Date("2026-05-26T10:40:00.000Z"),
					error: null,
				},
			],
		];

		const { streamServerInstallEvents } = await import("./install");
		const response = await streamServerInstallEvents(createContext("GET"));

		expect(response.headers.get("content-type")).toContain("text/event-stream");
		const body = await response.text();
		expect(body).toContain("install-progress");
		expect(body).toContain("Installing Docker");
	});

	it("returns an error when stored credential data is missing", async () => {
		serverSelectResults = [
			[
				{
					...defaultServerRecord(),
					encryptedCredential: null,
					storeCredential: true,
				},
			],
		];

		const { startServerInstall } = await import("./install");
		const response = await startServerInstall(createContext("POST"));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Stored credential is missing.",
		});
		expect(withSshConnection).not.toHaveBeenCalled();
	});

	it("returns an error for unsupported authentication methods", async () => {
		serverSelectResults = [
			[
				{
					...defaultServerRecord(),
					authMethod: "invalid-key",
					encryptedCredential: null,
					storeCredential: false,
				},
			],
		];

		const { startServerInstall } = await import("./install");
		const response = await startServerInstall(createContext("POST"));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Unsupported authentication method.",
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
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "server.install.failed",
			}),
		);
	});

	it("rejects a second install request while one is already running", async () => {
		let resolveFirstInstall: ((value: unknown) => void) | undefined;
		insertInstallReturning.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveFirstInstall = resolve;
				}),
		);

		serverSelectResults = [[defaultServerRecord()], [defaultServerRecord()]];
		installLimitResults = [[]];

		const { startServerInstall } = await import("./install");
		const firstPromise = startServerInstall(createContext("POST"));
		await new Promise((resolve) => setTimeout(resolve, 0));

		const secondResponse = await startServerInstall(createContext("POST"));

		expect(secondResponse.status).toBe(409);
		expect(await secondResponse.json()).toEqual({
			error: "Install already in progress",
		});

		resolveFirstInstall?.([{ id: "install_123" }]);
		await firstPromise;
	});

	it("writes a failed audit log when SSH connection itself errors", async () => {
		const { SshConnectError } = await import("./ssh");
		withSshConnection.mockRejectedValue(
			new SshConnectError("Connection refused"),
		);

		const { startServerInstall } = await import("./install");
		const response = await startServerInstall(createContext("POST"));

		expect(response.status).toBe(202);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "server.install.failed",
			}),
		);
	});

	it("returns null install log fields when no install exists", async () => {
		installLimitResults = [[]];

		const { getLatestServerInstallLog } = await import("./install");
		const response = await getLatestServerInstallLog(
			createContext("GET", "/install/log"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			installId: null,
			status: null,
			step: null,
			log: null,
			updatedAt: null,
		});
	});

	it("returns event-only install log text", async () => {
		installLimitResults = [
			[
				{
					id: "install_123",
					status: "succeeded",
					step: "start-containers",
					updatedAt: new Date("2026-05-26T03:05:00.000Z"),
				},
			],
		];
		installEventResults = [
			[
				{
					step: "install-docker",
					message: "Installing Docker",
					createdAt: new Date("2026-05-26T03:00:00.000Z"),
				},
			],
		];

		const { getLatestServerInstallLog } = await import("./install");
		const response = await getLatestServerInstallLog(
			createContext("GET", "/install/log"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			installId: "install_123",
			status: "succeeded",
			step: "start-containers",
			log: "2026-05-26T03:00:00.000Z [install-docker] Installing Docker",
			updatedAt: "2026-05-26T03:05:00.000Z",
		});
	});

	it("returns null log text when an install has no persisted events", async () => {
		installLimitResults = [
			[
				{
					id: "install_123",
					status: "succeeded",
					step: "start-containers",
					updatedAt: new Date("2026-05-26T03:05:00.000Z"),
				},
			],
		];
		installEventResults = [[]];

		const { getLatestServerInstallLog } = await import("./install");
		const response = await getLatestServerInstallLog(
			createContext("GET", "/install/log"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			installId: "install_123",
			log: null,
		});
	});

	it("allows retrying after a failed install", async () => {
		withSshConnection.mockImplementationOnce(async (_input, run) => {
			const execCommand = vi.fn().mockResolvedValue({
				code: 1,
				stdout: "",
				stderr: "host unreachable",
			});
			return run({ execCommand });
		});

		serverSelectResults = [[defaultServerRecord()], [defaultServerRecord()]];
		installLimitResults = [[], []];

		const { startServerInstall } = await import("./install");
		const firstResponse = await startServerInstall(createContext("POST"));

		expect(firstResponse.status).toBe(202);
		await new Promise((resolve) => setTimeout(resolve, 0));

		withSshConnection.mockImplementationOnce(async (_input, run) => {
			const execCommand = vi.fn().mockResolvedValue({
				code: 0,
				stdout: "ok",
				stderr: "",
			});
			return run({ execCommand });
		});

		const secondResponse = await startServerInstall(createContext("POST"));

		expect(secondResponse.status).toBe(202);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(withSshConnection).toHaveBeenCalledTimes(2);
	});
});

function defaultServerRecord() {
	return {
		id: "server_123",
		host: "203.0.113.10",
		port: 22,
		username: "root",
		authMethod: "password",
		encryptedCredential: "encrypted-secret",
		storeCredential: true,
	};
}

function createContext(
	method: "GET" | "POST",
	path = method === "GET" ? "/install/events" : "",
) {
	const headers = new Headers();

	return {
		req: {
			raw: new Request(`http://localhost/api/servers/server_123${path}`, {
				method,
			}),
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
