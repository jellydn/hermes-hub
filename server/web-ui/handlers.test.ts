import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getAuthSession,
	encryptSecret,
	decryptSecret,
	deployComposeViaSsh,
	resolveManagedComposeSecrets,
	buildManagedComposeContentFromSecrets,
	getOwnedServerRecord,
	resolveServerSshConfigOrError,
	getServerWebUiRecord,
	insertAuditLog,
	transaction,
	insertValues,
	onConflictDoUpdate,
	getLatestInstallForServer,
	proxyRequestOverSsh,
	invalidatePooledSsh,
} = vi.hoisted(() => ({
	getAuthSession: vi.fn(),
	encryptSecret: vi.fn(),
	decryptSecret: vi.fn(),
	deployComposeViaSsh: vi.fn(),
	resolveManagedComposeSecrets: vi.fn(),
	buildManagedComposeContentFromSecrets: vi.fn(),
	getOwnedServerRecord: vi.fn(),
	resolveServerSshConfigOrError: vi.fn(),
	getServerWebUiRecord: vi.fn(),
	insertAuditLog: vi.fn(),
	transaction: vi.fn(),
	insertValues: vi.fn(),
	onConflictDoUpdate: vi.fn(),
	getLatestInstallForServer: vi.fn(),
	proxyRequestOverSsh: vi.fn(),
	invalidatePooledSsh: vi.fn(),
}));

vi.mock("../auth", () => ({
	getAuthSession,
}));

vi.mock("../crypto", () => ({
	encryptSecret,
	decryptSecret,
}));

vi.mock("../deploy", () => ({
	deployComposeViaSsh,
}));

vi.mock("../server-compose", () => ({
	resolveManagedComposeSecrets,
	buildManagedComposeContentFromSecrets,
}));

vi.mock("../server-records", () => ({
	getOwnedServerRecord,
	resolveServerSshConfigOrError,
}));

vi.mock("../install/records", () => ({
	getLatestInstallForServer,
}));

vi.mock("./records", () => ({
	getServerWebUiRecord,
	getWebUiProxyPath: (serverId: string) =>
		`/api/servers/${serverId}/web-ui/proxy/`,
	decryptWebUiPassword: (value: string | null) =>
		value ? decryptSecret(value) : null,
}));

vi.mock("./ssh-forward", () => ({
	proxyRequestOverSsh,
}));

vi.mock("./ssh-pool", () => ({
	invalidatePooledSsh,
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

import {
	deployServerWebUi,
	proxyServerWebUi,
	revealServerWebUiPassword,
} from "./handlers";

function createContext(input?: {
	method?: string;
	url?: string;
	serverId?: string;
}) {
	return {
		req: {
			raw: new Request(input?.url ?? "http://localhost:3000/", {
				method: input?.method ?? "GET",
			}),
			url: input?.url ?? "http://localhost:3000/",
			header: vi.fn().mockReturnValue(null),
			param: (name: string) =>
				name === "id" ? (input?.serverId ?? "server_123") : undefined,
		},
		json: (body: unknown, status = 200) =>
			Response.json(body, { status }) as Response,
	} as unknown as Context;
}

describe("web-ui handlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		encryptSecret.mockImplementation((value: string) => `enc:${value}`);
		decryptSecret.mockImplementation((value: string) =>
			value.startsWith("enc:") ? value.slice(4) : value,
		);
		resolveManagedComposeSecrets.mockResolvedValue({
			telegramInfo: null,
			providerConfig: null,
			webUiRecord: null,
		});
		buildManagedComposeContentFromSecrets.mockReturnValue(
			"services:\n  hermes: {}",
		);
		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "ssh-secret",
		});
		getOwnedServerRecord.mockResolvedValue({
			id: "server_123",
			host: "203.0.113.10",
			port: 22,
			username: "root",
			hostKeyFingerprint: null,
		});
		insertAuditLog.mockResolvedValue(undefined);
		insertValues.mockReturnValue({ onConflictDoUpdate });
		onConflictDoUpdate.mockResolvedValue(undefined);
		transaction.mockImplementation(async (fn) =>
			fn({ insert: () => ({ values: insertValues }) }),
		);
		deployComposeViaSsh.mockResolvedValue(undefined);
		getLatestInstallForServer.mockResolvedValue({ status: "succeeded" });
		getServerWebUiRecord.mockResolvedValue(null);
		invalidatePooledSsh.mockReturnValue(undefined);
	});

	it("rejects unauthorized deploy requests", async () => {
		getAuthSession.mockResolvedValue(null);

		const response = await deployServerWebUi(createContext());
		expect(response.status).toBe(401);
	});

	it("deploys Web UI when install succeeded", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});

		const response = await deployServerWebUi(createContext());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.webUi.enabled).toBe(true);
		expect(resolveManagedComposeSecrets).toHaveBeenCalled();
		expect(buildManagedComposeContentFromSecrets).toHaveBeenCalled();
		expect(deployComposeViaSsh).toHaveBeenCalledWith(
			expect.objectContaining({
				preSshCommands: expect.any(Function),
			}),
		);
		expect(invalidatePooledSsh).toHaveBeenCalledWith("user_123", "server_123");
	});

	it("rejects deploy when install is missing", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		getLatestInstallForServer.mockResolvedValueOnce(null);

		const response = await deployServerWebUi(createContext());
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toMatch(/install hermes/i);
	});

	it("rejects deploy when install failed", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		getLatestInstallForServer.mockResolvedValueOnce({ status: "failed" });

		const response = await deployServerWebUi(createContext());
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toMatch(/did not succeed/i);
	});

	it("rejects deploy when SSH credentials are missing", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		resolveServerSshConfigOrError.mockReturnValue({
			ok: false,
			error: "SSH credential required",
		});

		const response = await deployServerWebUi(createContext());
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toBe("SSH credential required");
	});

	it("rejects deploy when stored Web UI password cannot be decrypted", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		getServerWebUiRecord.mockResolvedValue({
			enabled: false,
			encryptedPassword: "corrupt",
			port: 8787,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});
		decryptSecret.mockImplementation(() => null);

		const response = await deployServerWebUi(createContext());
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload.error).toMatch(
			/stored hermes web ui password could not be decrypted/i,
		);
	});

	it("reveals the Web UI password for enabled servers", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		getServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:generated-password",
			port: 8787,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		const response = await revealServerWebUiPassword(createContext());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.password).toBe("generated-password");
	});

	it("rejects unauthorized password reveal requests", async () => {
		getAuthSession.mockResolvedValue(null);

		const response = await revealServerWebUiPassword(createContext());
		expect(response.status).toBe(401);
	});

	it("proxies requests with rewritten response headers", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		getServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:generated-password",
			port: 8787,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		proxyRequestOverSsh.mockResolvedValue(
			new Response(null, {
				status: 302,
				headers: {
					Location: "/login",
					"Set-Cookie": "session=abc; Path=/",
				},
			}),
		);

		const response = await proxyServerWebUi(
			createContext({
				url: "http://localhost:3000/api/servers/server_123/web-ui/proxy/chat",
			}),
		);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"/api/servers/server_123/web-ui/proxy/login",
		);
		expect(response.headers.get("set-cookie")).toBe(
			"session=abc; Path=/api/servers/server_123/web-ui/proxy/",
		);
	});
});
