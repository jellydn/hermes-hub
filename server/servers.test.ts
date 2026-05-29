import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, servers } from "./db/schema";

const getAuthSession = vi.fn();
const insertServerValues = vi.fn();
const insertAuditValues = vi.fn();
const insertServerReturning = vi.fn();
const dbInsert = vi.fn();
const dbSelect = vi.fn();
const dbUpdate = vi.fn();
const updateServerSet = vi.fn();
const updateServerWhere = vi.fn();
const selectFrom = vi.fn();
const selectWhere = vi.fn();
const selectLimit = vi.fn();
const verifyServerConnection = vi.fn();
const encryptSecret = vi.fn();
const decryptSecret = vi.fn();
const storeSessionCredential = vi.fn();
const getSessionCredential = vi.fn();
const getServerDetailSnapshot = vi.fn();

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./db", () => ({
	getDb: () => ({
		insert: dbInsert,
		select: dbSelect,
		update: dbUpdate,
	}),
}));

vi.mock("./crypto", () => ({
	encryptSecret,
	decryptSecret,
}));

vi.mock("./credentials", () => ({
	getSessionCredential,
	storeSessionCredential,
}));

vi.mock("./server-actions", () => ({
	getServerDetailSnapshot,
}));

vi.mock("./ssh", () => {
	class UnsupportedOsError extends Error {
		constructor(message: string) {
			super(message);
			this.name = "UnsupportedOsError";
		}
	}

	class SshConnectError extends Error {
		constructor(message: string) {
			super(message);
			this.name = "SshConnectError";
		}
	}

	return {
		verifyServerConnection,
		UnsupportedOsError,
		SshConnectError,
	};
});

describe("server handlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		dbInsert.mockImplementation((table) => {
			if (table === servers) {
				return {
					values: insertServerValues,
				};
			}

			if (table !== auditLogs) {
				throw new Error("Unexpected table insert");
			}

			return {
				values: insertAuditValues,
			};
		});

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({ limit: selectLimit });
		selectLimit.mockResolvedValue([]);

		dbUpdate.mockReturnValue({ set: updateServerSet });
		updateServerSet.mockReturnValue({ where: updateServerWhere });
		updateServerWhere.mockResolvedValue(undefined);

		insertServerValues.mockReturnValue({
			returning: insertServerReturning,
		});
		insertAuditValues.mockResolvedValue(undefined);
		insertServerReturning.mockResolvedValue([
			{
				id: "server_123",
				label: "Production",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				status: "connected",
				osInfo: {
					name: "Ubuntu 22.04.4 LTS",
					version: "22.04",
					architecture: "x86_64",
				},
			},
		]);
		encryptSecret.mockReturnValue("encrypted-secret");
		decryptSecret.mockReturnValue("secret");
		getAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});
		verifyServerConnection.mockResolvedValue({
			osName: "Ubuntu 22.04.4 LTS",
			osVersion: "22.04",
			architecture: "x86_64",
			supportLevel: "supported",
			raw: { ID: "ubuntu", VERSION_ID: "22.04" },
		});
		getServerDetailSnapshot.mockResolvedValue({
			server: {
				id: "server_123",
				label: "Primary VPS",
				host: "198.51.100.25",
				port: 2222,
				username: "deploy",
				authMethod: "password",
				status: "connected",
				osName: "Ubuntu 22.04.4 LTS",
				osVersion: "22.04",
				architecture: "x86_64",
				supportLevel: "supported",
			},
			install: null,
			actionHistory: [],
			rollbackTarget: null,
		});
	});

	it("stores encrypted credentials when requested", async () => {
		const { connectServer } = await import("./servers");
		const response = await connectServer(
			createContext({
				label: "Production",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "password",
				password: "secret",
				storeCredential: true,
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			verification: {
				host: "203.0.113.10",
				osName: "Ubuntu 22.04.4 LTS",
				osVersion: "22.04",
				architecture: "x86_64",
			},
		});
		expect(verifyServerConnection).toHaveBeenCalledWith({
			host: "203.0.113.10",
			port: 22,
			username: "root",
			authMethod: "password",
			credential: "secret",
		});
		expect(encryptSecret).toHaveBeenCalledWith("secret");
		expect(storeSessionCredential).not.toHaveBeenCalled();
	});

	it("keeps credentials ephemeral when requested", async () => {
		const { connectServer } = await import("./servers");
		const response = await connectServer(
			createContext({
				label: "Production",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "ssh-key",
				privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----",
				storeCredential: false,
			}),
		);

		expect(response.status).toBe(200);
		expect(encryptSecret).not.toHaveBeenCalled();
		expect(storeSessionCredential).toHaveBeenCalledWith({
			serverId: "server_123",
			sessionId: "session_123",
			authMethod: "ssh-key",
			credential: "-----BEGIN OPENSSH PRIVATE KEY-----",
		});
	});

	it("returns SSH connection errors as bad requests and logs the failure", async () => {
		const { SshConnectError } = await import("./ssh");
		verifyServerConnection.mockRejectedValueOnce(
			new SshConnectError("host unreachable"),
		);

		const { connectServer } = await import("./servers");
		const response = await connectServer(
			createContext({
				label: "Production",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "password",
				password: "secret",
				storeCredential: true,
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "host unreachable",
		});
		expect(insertAuditValues).toHaveBeenCalled();
	});

	it("updates server basics and returns the refreshed detail snapshot", async () => {
		selectLimit.mockResolvedValueOnce([
			{
				id: "server_123",
				label: "Production",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "password",
				encryptedCredential: "encrypted-secret",
				storeCredential: true,
				status: "connected",
				osInfo: {},
			},
		]);

		const { updateServer } = await import("./servers");
		const response = await updateServer(
			createContext(
				{
					label: "Primary VPS",
					host: "198.51.100.25",
					port: 2222,
					username: "deploy",
				},
				{
					method: "PATCH",
					url: "http://localhost/api/servers/server_123",
					serverId: "server_123",
				},
			),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			serverDetail: {
				server: {
					label: "Primary VPS",
					host: "198.51.100.25",
				},
			},
		});
		expect(decryptSecret).toHaveBeenCalledWith("encrypted-secret");
		expect(verifyServerConnection).toHaveBeenCalledWith({
			host: "198.51.100.25",
			port: 2222,
			username: "deploy",
			authMethod: "password",
			credential: "secret",
		});
		expect(updateServerSet).toHaveBeenCalledWith(
			expect.objectContaining({
				label: "Primary VPS",
				host: "198.51.100.25",
				port: 2222,
				username: "deploy",
			}),
		);
	});

	it("returns a reconnect error when update credentials are gone", async () => {
		selectLimit.mockResolvedValueOnce([
			{
				id: "server_123",
				label: "Production",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "ssh-key",
				encryptedCredential: null,
				storeCredential: false,
				status: "connected",
				osInfo: {},
			},
		]);
		getSessionCredential.mockReturnValue(null);

		const { updateServer } = await import("./servers");
		const response = await updateServer(
			createContext(
				{ host: "198.51.100.25" },
				{
					method: "PATCH",
					url: "http://localhost/api/servers/server_123",
					serverId: "server_123",
				},
			),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Temporary credential expired. Reconnect the server first.",
		});
		expect(verifyServerConnection).not.toHaveBeenCalled();
	});
});

function createContext(
	body: unknown,
	options?: { method?: string; url?: string; serverId?: string },
) {
	const url = options?.url ?? "http://localhost/api/servers/connect";
	const method = options?.method ?? "POST";
	const serverId = options?.serverId ?? "server_123";

	return {
		req: {
			raw: new Request(url, {
				method,
				body: JSON.stringify(body),
				headers: { "content-type": "application/json" },
			}),
			json: () => Promise.resolve(body),
			header: () => null,
			param: (name: string) => (name === "id" ? serverId : undefined),
		},
		json: (payload: unknown, status = 200) =>
			new Response(JSON.stringify(payload), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as never;
}
