import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, servers } from "./db/schema";

const getAuthSession = vi.fn();
const insertServerValues = vi.fn();
const insertAuditValues = vi.fn();
const insertServerReturning = vi.fn();
const dbInsert = vi.fn();
const verifyServerConnection = vi.fn();
const encryptSecret = vi.fn();
const storeSessionCredential = vi.fn();

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./db", () => ({
	getDb: () => ({
		insert: dbInsert,
		select: vi.fn(),
	}),
}));

vi.mock("./crypto", () => ({
	encryptSecret,
}));

vi.mock("./credentials", () => ({
	storeSessionCredential,
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

describe("connectServer", () => {
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
		getAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});
		verifyServerConnection.mockResolvedValue({
			osName: "Ubuntu 22.04.4 LTS",
			osVersion: "22.04",
			architecture: "x86_64",
			raw: { ID: "ubuntu", VERSION_ID: "22.04" },
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

	it("returns unsupported os errors as bad requests and logs the failure", async () => {
		const { UnsupportedOsError } = await import("./ssh");
		verifyServerConnection.mockRejectedValueOnce(
			new UnsupportedOsError(
				"Unsupported OS: Ubuntu 20.04. Requires Ubuntu 22.04+ or Debian 12+",
			),
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
			error:
				"Unsupported OS: Ubuntu 20.04. Requires Ubuntu 22.04+ or Debian 12+",
		});
		expect(insertAuditValues).toHaveBeenCalled();
	});
});

function createContext(body: unknown) {
	return {
		req: {
			raw: new Request("http://localhost/api/servers/connect", {
				method: "POST",
				body: JSON.stringify(body),
				headers: { "content-type": "application/json" },
			}),
			json: () => Promise.resolve(body),
			header: () => null,
		},
		json: (payload: unknown, status = 200) =>
			new Response(JSON.stringify(payload), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as never;
}
