import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditLogs } from "./db/schema";

const getAuthSession = vi.fn();
const getTelegramDeployInfo = vi.fn();
const decryptSecret = vi.fn();
const decryptApiServerKey = vi.fn();
const dbInsert = vi.fn();
const insertAuditValues = vi.fn();
const deployManagedCompose = vi.fn();
const getOwnedServerRecordMock = vi.fn();
const resolveServerSshConfig = vi.fn();
const resolveServerSshConfigOrError = vi.fn();
const resolveRemoteCodexAuthStatus = vi.fn();
const resolveActiveModelBackend = vi.fn();

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./crypto", () => ({
	decryptSecret,
	decryptApiServerKey,
}));

vi.mock("./db", () => ({
	getDb: () => ({
		insert: dbInsert,
	}),
}));

vi.mock("./managed-compose-deploy", () => ({
	deployManagedCompose,
}));

vi.mock("./server-records", () => ({
	getOwnedServerRecord: getOwnedServerRecordMock,
	resolveServerSshConfig,
	resolveServerSshConfigOrError,
}));

vi.mock("./providers/codex-auth", () => ({
	resolveRemoteCodexAuthStatus,
}));

vi.mock("./providers/model-access", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("./providers/model-access")>();
	return {
		...actual,
		resolveActiveModelBackend,
	};
});

vi.mock("./providers/records", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./providers/records")>();
	return {
		...actual,
		getTelegramDeployInfo,
	};
});

describe("deployProviderToHermes", () => {
	const apiBackend = {
		kind: "api-provider" as const,
		provider: "openai" as const,
		model: "gpt-4o",
		encryptedApiKey: "encrypted-api-key",
		baseUrl: null,
	};

	const telegramRecord = {
		botToken: "encrypted-bot-token",
		apiServerKey: "encrypted-api-server-key",
		deployedServerId: "server_1",
		deployedServerHost: "1.2.3.4",
	};

	const serverRecord = {
		id: "server_1",
		label: "prod",
		host: "1.2.3.4",
		port: 22,
		username: "root",
		authMethod: "ssh-key",
		encryptedCredential: "encrypted-credential",
		storeCredential: true,
		status: "connected",
		osInfo: {},
		hostKeyFingerprint: null,
		hostKeyAlgorithm: null,
	};

	beforeEach(() => {
		vi.clearAllMocks();

		getAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});
		getTelegramDeployInfo.mockResolvedValue(telegramRecord);
		decryptSecret.mockReturnValue("stored-api-key");
		decryptApiServerKey.mockReturnValue("api-server-key-value");
		deployManagedCompose.mockResolvedValue(undefined);
		resolveServerSshConfig.mockReturnValue({
			authMethod: "ssh-key",
			credential: "mock-credential",
		});
		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "ssh-key",
			credential: "mock-credential",
		});
		getOwnedServerRecordMock.mockResolvedValue(serverRecord);
		resolveActiveModelBackend.mockResolvedValue(null);

		dbInsert.mockImplementation((table) => {
			if (table === auditLogs) {
				return { values: insertAuditValues };
			}

			throw new Error("Unexpected table insert");
		});
		insertAuditValues.mockResolvedValue(undefined);
	});

	it("returns 401 when unauthenticated", async () => {
		getAuthSession.mockResolvedValue(null);

		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ error: "Unauthorized" });
	});

	it("returns 400 when no model access config exists", async () => {
		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error:
				"No model access config found. Save an API provider or subscription first.",
		});
	});

	it("returns 400 when no Telegram deploy info exists", async () => {
		getTelegramDeployInfo.mockResolvedValueOnce(null);
		resolveActiveModelBackend.mockResolvedValueOnce(apiBackend);

		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error:
				"No Hermes deployment found. Deploy a Telegram bot to a server first.",
		});
	});

	it("returns 404 when deployed server is not found", async () => {
		getOwnedServerRecordMock.mockResolvedValueOnce(null);
		resolveActiveModelBackend.mockResolvedValueOnce(apiBackend);

		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({
			error: "Server not found",
		});
	});

	it("returns 500 when bot token decryption fails", async () => {
		resolveActiveModelBackend.mockResolvedValueOnce(apiBackend);
		decryptSecret.mockImplementationOnce(() => {
			throw new Error("decrypt failed");
		});

		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({
			error: "Failed to decrypt bot token.",
		});
	});

	it("returns 500 when the API server key is legacy plaintext", async () => {
		resolveActiveModelBackend.mockResolvedValueOnce(apiBackend);
		decryptApiServerKey.mockImplementationOnce(() => {
			throw new Error(
				"API server key is in legacy plaintext format and cannot be decrypted; the operator must re-save it via /api/providers.",
			);
		});

		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining("legacy plaintext format"),
		});
		expect(deployManagedCompose).not.toHaveBeenCalled();
	});

	it("returns 502 when managed compose deploy fails", async () => {
		deployManagedCompose.mockRejectedValueOnce(new Error("Write failed"));
		resolveActiveModelBackend.mockResolvedValueOnce(apiBackend);

		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: "Deploy failed: Write failed",
		});
	});

	it("returns 409 with hostKey details when managed compose deploy throws host_key_missing", async () => {
		resolveActiveModelBackend.mockResolvedValueOnce(apiBackend);

		const { SshConnectError } = await import("./ssh");
		deployManagedCompose.mockRejectedValueOnce(
			new SshConnectError(
				"host key pin required but not stored",
				"host_key_missing",
				{ fingerprint: "SHA256:abc123", algorithm: "ssh-ed25519" },
			),
		);

		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);
		const payload = await response.json();

		// Recoverable host-key errors respond with the typed 409 shape (not a
		// plain 502) so the UI can show the trust-this-key recovery flow.
		expect(response.status).toBe(409);
		expect(payload).toMatchObject({
			code: "host_key_missing",
			serverId: "server_1",
			serverHost: "1.2.3.4",
			hostKey: {
				observedFingerprint: "SHA256:abc123",
				observedAlgorithm: "ssh-ed25519",
			},
		});
		expect(payload.error).toContain("Host key fingerprint not stored");

		// Recoverable host-key errors are not audit-logged — no failed-deploy row.
		expect(insertAuditValues).not.toHaveBeenCalled();
	});

	it("returns 200 when deploy succeeds but success audit logging fails", async () => {
		insertAuditValues.mockRejectedValueOnce(new Error("audit db down"));
		resolveActiveModelBackend.mockResolvedValueOnce(apiBackend);

		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "deployed",
			provider: "openai",
			model: "gpt-4o",
		});
	});

	it("returns 400 when stored API-key ciphertext cannot be decrypted", async () => {
		decryptSecret.mockImplementation((value: string) => {
			if (value === "corrupt-ciphertext") {
				throw new Error("decrypt failed");
			}

			return "stored-api-key";
		});

		resolveActiveModelBackend.mockResolvedValueOnce({
			...apiBackend,
			encryptedApiKey: "corrupt-ciphertext",
		});

		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "Stored API key could not be read. Paste a new key.",
		});
		expect(deployManagedCompose).not.toHaveBeenCalled();
	});

	it("returns 400 when ChatGPT subscription deploy is attempted without remote auth", async () => {
		resolveRemoteCodexAuthStatus.mockResolvedValueOnce({
			authenticated: false,
			authMode: null,
			lastRefresh: null,
		});

		resolveActiveModelBackend.mockResolvedValueOnce({
			kind: "subscription",
			access: "oauth",
			subscriptionProvider: "chatgpt",
			model: "gpt-5.5",
			authMode: "chatgpt",
			hermesProviderId: "openai-codex",
		});

		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining("Complete ChatGPT device-code login"),
		});
		expect(deployManagedCompose).not.toHaveBeenCalled();
	});

	it("deploys ChatGPT subscription when remote auth is present", async () => {
		resolveRemoteCodexAuthStatus.mockResolvedValueOnce({
			authenticated: true,
			authMode: "chatgpt",
			lastRefresh: "2026-06-06T12:00:00.000Z",
		});

		resolveActiveModelBackend.mockResolvedValueOnce({
			kind: "subscription",
			access: "oauth",
			subscriptionProvider: "chatgpt",
			model: "gpt-5.4-mini",
			authMode: "chatgpt",
			hermesProviderId: "openai-codex",
		});

		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);

		expect(response.status).toBe(200);
		expect(deployManagedCompose).toHaveBeenCalledWith(
			expect.objectContaining({
				providerModel: "gpt-5.4-mini",
				providerHermesId: "openai-codex",
			}),
		);
	});

	it("deploys legacy openai-codex rows even when stored ciphertext is corrupt", async () => {
		decryptSecret.mockImplementation((value: string) => {
			if (value === "corrupt-ciphertext") {
				throw new Error("decrypt failed");
			}

			return "stored-api-key";
		});

		resolveRemoteCodexAuthStatus.mockResolvedValueOnce({
			authenticated: true,
			authMode: "chatgpt",
			lastRefresh: "2026-06-06T12:00:00.000Z",
		});

		resolveActiveModelBackend.mockResolvedValueOnce({
			kind: "subscription",
			access: "oauth",
			subscriptionProvider: "chatgpt",
			model: "gpt-5.4-mini",
			authMode: "chatgpt",
			hermesProviderId: "openai-codex",
		});

		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "deployed",
			provider: "chatgpt",
			model: "gpt-5.4-mini",
		});
		expect(deployManagedCompose).toHaveBeenCalledWith(
			expect.objectContaining({
				providerModel: "gpt-5.4-mini",
				providerHermesId: "openai-codex",
			}),
		);
	});

	it("returns 200 on successful deploy and logs all side effects", async () => {
		resolveActiveModelBackend.mockResolvedValueOnce(apiBackend);

		const { deployProviderToHermes } = await import("./deploy");
		const response = await deployProviderToHermes(
			createContext("http://localhost/api/providers/deploy", {}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "deployed",
			provider: "openai",
			model: "gpt-4o",
			serverHost: "1.2.3.4",
		});

		expect(deployManagedCompose).toHaveBeenCalledWith({
			intent: "provider",
			userId: "user_123",
			serverId: "server_1",
			host: "1.2.3.4",
			port: 22,
			username: "root",
			authMethod: "ssh-key",
			credential: "mock-credential",
			expectedFingerprint: undefined,
			apiServerKey: "api-server-key-value",
			providerModel: "gpt-4o",
			providerHermesId: "openai-api",
		});

		expect(resolveServerSshConfigOrError).toHaveBeenCalledWith(
			expect.objectContaining({ id: "server_1", host: "1.2.3.4" }),
			"session_123",
		);

		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user_123",
				action: "provider.deploy.succeeded",
				details: expect.objectContaining({
					provider: "openai",
					model: "gpt-4o",
				}),
			}),
		);
	});
});

function createContext(url: string, body: unknown) {
	return {
		req: {
			raw: new Request(url, {
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
