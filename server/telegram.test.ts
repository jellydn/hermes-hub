import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthSession = vi.fn();
const encryptSecret = vi.fn();
const decryptSecret = vi.fn();
const decryptApiServerKey = vi.fn();
const insertValues = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn();
const selectFrom = vi.fn();
const selectInnerJoin = vi.fn();
const selectWhere = vi.fn();
const selectOrderBy = vi.fn();
const selectLimit = vi.fn();
const withSshConnection = vi.fn();
const transaction = vi.fn();
const getProviderDeployConfig = vi.fn();
const getServerByIdMock = vi.fn();
const resolveServerSshConfig = vi.fn();
const resolveServerSshConfigOrError = vi.fn();
const deployManagedCompose = vi.fn();

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./crypto", () => ({
	encryptSecret,
	decryptSecret,
	decryptApiServerKey,
}));

vi.mock("./db", () => ({
	getDb: () => ({
		insert: () => ({ values: insertValues }),
		update: () => ({ set: updateSet }),
		select: () => ({ from: selectFrom }),
		transaction,
	}),
}));

vi.mock("./db/schema", () => ({
	telegramConfigs: {
		userId: Symbol("telegramConfigs.userId"),
		botToken: Symbol("telegramConfigs.botToken"),
		botUsername: Symbol("telegramConfigs.botUsername"),
		isActive: Symbol("telegramConfigs.isActive"),
		createdAt: Symbol("telegramConfigs.createdAt"),
	},
	servers: {
		id: Symbol("servers.id"),
		host: Symbol("servers.host"),
		port: Symbol("servers.port"),
		username: Symbol("servers.username"),
		authMethod: Symbol("servers.authMethod"),
		encryptedCredential: Symbol("servers.encryptedCredential"),
		storeCredential: Symbol("servers.storeCredential"),
		userId: Symbol("servers.userId"),
	},
	installs: {
		serverId: Symbol("installs.serverId"),
		status: Symbol("installs.status"),
		createdAt: Symbol("installs.createdAt"),
	},
	auditLogs: {},
}));

vi.mock("./ssh", () => ({
	withSshConnection,
	shellQuote: (value: string) => `'${value.replace(/'/g, "'\\''")}'`,
}));

vi.mock("./providers", () => ({
	getProviderDeployConfig,
}));

vi.mock("./server-records", () => ({
	getServerById: getServerByIdMock,
	resolveServerSshConfig,
	resolveServerSshConfigOrError,
}));

vi.mock("./managed-compose-deploy", () => ({
	deployManagedCompose,
}));

const setProviderModel = vi.fn();
const setProviderInferenceProvider = vi.fn();

vi.mock("./hermes/runtime", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./hermes/runtime")>();
	return {
		...actual,
		setProviderModel,
		setProviderInferenceProvider,
	};
});

vi.mock("#/lib/ai-providers", () => ({
	isApiProviderId: (value: string) =>
		["openai", "anthropic", "openrouter", "ollama", "custom"].includes(value),
	isValidAiModel: (provider: string, model: string) => {
		if (provider === "openai") {
			return ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"].includes(model);
		}
		return true;
	},
	isValidModelString: (model: string) =>
		/^[A-Za-z0-9._:/-]{1,120}$/.test(model),
	apiProviderOptions: [
		{
			id: "openai",
			models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
			requiresCustomModel: false,
		},
		{
			id: "anthropic",
			models: ["claude-sonnet-4-20250514"],
			requiresCustomModel: false,
		},
		{ id: "openrouter", models: [], requiresCustomModel: true },
		{ id: "ollama", models: [], requiresCustomModel: true },
		{ id: "custom", models: [], requiresCustomModel: true },
	],
}));

vi.mock("./providers/config", () => ({
	PROVIDER_ENV_CONFIGS: {
		openai: { hermesProvider: "openai-api" },
		anthropic: { hermesProvider: "anthropic" },
		openrouter: { hermesProvider: "openrouter" },
		ollama: { hermesProvider: "custom" },
		custom: { hermesProvider: "custom" },
	},
}));

describe("telegram handlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		encryptSecret.mockImplementation((value: string) => `enc:${value}`);
		decryptSecret.mockImplementation((value: string) =>
			value.startsWith("enc:") ? value.slice(4) : value,
		);
		decryptApiServerKey.mockReturnValue("decrypted-server-key");
		resolveServerSshConfig.mockReturnValue({
			authMethod: "password",
			credential: "test-credential",
		});
		getProviderDeployConfig.mockResolvedValue({
			envVars: { HERMES_INFERENCE_PROVIDER: "openai" },
			model: "gpt-4o",
		});
		deployManagedCompose.mockResolvedValue(undefined);
		transaction.mockImplementation(async (fn) => {
			const tx = {
				update: () => ({ set: updateSet }),
				insert: () => ({ values: insertValues }),
			};
			return fn(tx);
		});
		updateSet.mockReturnValue({ where: updateWhere });
		updateWhere.mockResolvedValue(undefined);
		insertValues.mockResolvedValue(undefined);
		selectInnerJoin.mockReturnValue({
			where: selectWhere,
			orderBy: selectOrderBy,
			limit: selectLimit,
		});
		selectFrom.mockReturnValue({
			innerJoin: selectInnerJoin,
			where: selectWhere,
			orderBy: selectOrderBy,
			limit: selectLimit,
		});
		selectWhere.mockReturnValue({ orderBy: selectOrderBy, limit: selectLimit });
		selectOrderBy.mockReturnValue({ limit: selectLimit });
		selectLimit.mockResolvedValue([]);
	});

	it("returns unauthorized when connect runs without a session", async () => {
		getAuthSession.mockResolvedValueOnce(null);
		const { connectTelegram } = await import("./telegram");

		const response = await connectTelegram(
			createContext({ botToken: "123:abc" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(401);
		expect(payload).toEqual({ error: "Unauthorized" });
	});

	it("validates the Telegram token before persisting it", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						ok: true,
						result: { id: 42, username: "hermes_helper_bot" },
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			),
		);

		const { connectTelegram } = await import("./telegram");
		const response = await connectTelegram(
			createContext({ botToken: "123456:secret-token" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({
			telegram: {
				botUsername: "hermes_helper_bot",
				botTokenLast4: "oken",
				isActive: true,
				deployedServerHost: null,
			},
		});
		expect(updateSet).toHaveBeenCalled();
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				botToken: "enc:123456:secret-token",
			}),
		);
		expect(encryptSecret).toHaveBeenCalledWith("123456:secret-token");
	});

	it("returns a clear invalid token error", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(
				new Response(
					JSON.stringify({ ok: false, description: "Unauthorized" }),
					{
						status: 401,
						headers: { "content-type": "application/json" },
					},
				),
			),
		);

		const { connectTelegram } = await import("./telegram");
		const response = await connectTelegram(
			createContext({ botToken: "bad-token" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload).toEqual({ error: "Invalid bot token" });
	});

	it("disconnects the active Telegram bot", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		selectLimit.mockResolvedValueOnce([
			{
				botToken: "123456:secret-token",
				botUsername: "hermes_helper_bot",
				isActive: true,
			},
		]);

		const { disconnectTelegram } = await import("./telegram");
		const response = await disconnectTelegram(createContext());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({ status: "disconnected" });
		expect(updateSet).toHaveBeenCalled();
		expect(insertValues).toHaveBeenCalled();
	});

	it("testTelegramBot shell-quotes the model value in the curl command", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});

		// Simulate a model name containing a single quote — the curl command
		// must still be a valid, non-injectable shell command.
		getProviderDeployConfig.mockResolvedValue({
			envVars: { HERMES_INFERENCE_PROVIDER: "custom" },
			model: "test's-model",
		});

		selectLimit.mockResolvedValueOnce([
			{
				botToken: "enc:123456:secret-token",
				botUsername: "hermes_helper_bot",
				isActive: true,
				deployedServerId: "server_1",
				deployedServerHost: "192.168.1.1",
				apiServerKey: "enc:api-server-key",
			},
		]);
		getServerByIdMock.mockResolvedValue({
			id: "server_1",
			host: "192.168.1.1",
			port: 22,
			username: "root",
			authMethod: "password",
			encryptedCredential: null,
			storeCredential: false,
		});
		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "test-credential",
		});

		// Track the command passed to ssh.execCommand
		let capturedCommand = "";
		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: {
					execCommand: (
						cmd: string,
						opts?: unknown,
					) => Promise<{ code: number; stdout: string; stderr: string }>;
				}) => Promise<unknown>,
			) => {
				return callback({
					execCommand: async (cmd: string) => {
						capturedCommand = cmd;
						return {
							code: 0,
							stdout: JSON.stringify({
								choices: [
									{
										message: {
											content: "Hello, world!",
										},
									},
								],
							}),
							stderr: "",
						};
					},
				});
			},
		);

		const { testTelegramBot } = await import("./telegram");
		const response = await testTelegramBot(createContext({ message: "Hello" }));

		// The request should succeed
		expect(response.status).toBe(200);

		// Verify the captured curl command contains the model value shell-quoted
		// inside the JSON payload via the single-quote escape sequence.
		expect(capturedCommand).toContain("test'\\''s-model");
		// Single quotes in the JSON payload are escaped via '\\'' so they never
		// break out of the outer single-quoted -d '...' argument.
		expect(capturedCommand).toContain('"model":"test\'\\\'\'s-model"');
	});

	it("does not persist deploy state when SSH deploy fails", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});

		// First .limit() — getLatestTelegramRecord with existing deploy state
		selectLimit.mockResolvedValueOnce([
			{
				botToken: "enc:123456:secret-token",
				botUsername: "hermes_helper_bot",
				isActive: true,
				deployedServerId: "server_old",
				deployedServerHost: "5.6.7.8",
				apiServerKey: "enc:old-server-key",
			},
		]);

		// Second .limit() — findServerForDeploy
		selectLimit.mockResolvedValueOnce([
			{
				id: "server_1",
				host: "1.2.3.4",
				port: 22,
				username: "root",
				authMethod: "password",
				encryptedCredential: null,
				storeCredential: false,
			},
		]);

		// SSH fails
		deployManagedCompose.mockRejectedValueOnce(
			new Error("SSH connection refused"),
		);

		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "test-credential",
		});

		const { deployTelegramToServer } = await import("./telegram");
		const response = await deployTelegramToServer(
			createContext() as unknown as Context,
		);

		expect(response.status).toBe(502);
		const payload = await response.json();
		expect(payload).toMatchObject({
			error: expect.stringContaining("Deploy failed"),
		});

		// The deploy state should NOT have been persisted — the only updateSet
		// call in deployTelegramToServer is after successful SSH, so if SSH
		// fails, updateSet should never be called.
		expect(updateSet).not.toHaveBeenCalled();

		// An audit log for the failure should have been written with the
		// original deployedServerId preserved in the details.
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "telegram.deploy.failed",
				details: expect.objectContaining({
					serverId: "server_1",
				}),
			}),
		);
	});

	it("deployTelegramToServer persists deploy state and audit log in a single transaction", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});

		// getLatestTelegramRecord — active bot
		selectLimit.mockResolvedValueOnce([
			{
				botToken: "enc:123456:secret-token",
				botUsername: "hermes_helper_bot",
				isActive: true,
				deployedServerId: null,
				deployedServerHost: null,
				apiServerKey: null,
			},
		]);

		// findServerForDeploy
		selectLimit.mockResolvedValueOnce([
			{
				id: "server_1",
				host: "1.2.3.4",
				port: 22,
				username: "root",
				authMethod: "password",
				encryptedCredential: "enc:credential",
				storeCredential: true,
				hostKeyFingerprint: "SHA256:abc",
			},
		]);

		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "decrypted-credential",
		});

		deployManagedCompose.mockResolvedValueOnce(undefined);

		let txInsertCalls = 0;
		let txUpdateCalls = 0;
		transaction.mockImplementation(async (fn) => {
			const tx = {
				update: () => {
					txUpdateCalls += 1;
					return { set: () => ({ where: updateWhere }) };
				},
				insert: () => {
					txInsertCalls += 1;
					return { values: insertValues };
				},
			};
			return fn(tx);
		});

		const { deployTelegramToServer } = await import("./telegram");
		const response = await deployTelegramToServer(
			createContext() as unknown as Context,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "deployed",
			serverHost: "1.2.3.4",
		});

		expect(deployManagedCompose).toHaveBeenCalledWith(
			expect.objectContaining({
				intent: "telegram",
				userId: "user_123",
				serverId: "server_1",
				host: "1.2.3.4",
				port: 22,
				username: "root",
				authMethod: "password",
				credential: "decrypted-credential",
				expectedFingerprint: "SHA256:abc",
				telegramBotToken: "123456:secret-token",
				apiServerKey: expect.any(String),
			}),
		);

		// Single transaction containing both the update and the audit log.
		expect(transaction).toHaveBeenCalledTimes(1);
		expect(txUpdateCalls).toBe(1);
		expect(txInsertCalls).toBe(1);

		// The audit row was inserted with the explicit serverId column.
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "telegram.deployed",
				serverId: "server_1",
				details: expect.objectContaining({
					serverId: "server_1",
					serverHost: "1.2.3.4",
				}),
			}),
		);
	});

	it("runHermesPairingJsonCommand shell-quotes env vars and python code", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});

		selectLimit.mockResolvedValueOnce([
			{
				botToken: "enc:123456:secret-token",
				botUsername: "hermes_helper_bot",
				isActive: true,
				deployedServerId: "server_1",
				deployedServerHost: "192.168.1.1",
				apiServerKey: "enc:api-server-key",
			},
		]);
		getServerByIdMock.mockResolvedValue({
			id: "server_1",
			host: "192.168.1.1",
			port: 22,
			username: "root",
			authMethod: "password",
			encryptedCredential: null,
			storeCredential: false,
		});
		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "test-credential",
		});

		let capturedCommand = "";
		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: {
					execCommand: (
						cmd: string,
					) => Promise<{ code: number; stdout: string; stderr: string }>;
				}) => Promise<unknown>,
			) => {
				return callback({
					execCommand: async (cmd: string) => {
						capturedCommand = cmd;
						return {
							code: 0,
							stdout: JSON.stringify({
								pending: [],
								approved: [],
							}),
							stderr: "",
						};
					},
				});
			},
		);

		const { listTelegramPairings } = await import("./telegram");
		const response = await listTelegramPairings(
			createContext() as unknown as Context,
		);

		expect(response.status).toBe(200);

		// The command repairs any root-owned pairing files from older approvals,
		// then runs the Python pairing store as the same `hermes` user as the
		// live gateway so approved users are readable by Telegram polling.
		expect(capturedCommand).toMatch(
			/^sudo docker exec hermes sh -lc 'chown -R hermes:hermes/,
		);
		expect(capturedCommand).toContain("&& sudo docker exec --user hermes");
		// The python code should be a complete, valid statement inside quotes
		expect(capturedCommand).toContain(
			"import json; from gateway.pairing import PairingStore",
		);
		// The command should end with a closing single quote
		expect(capturedCommand?.trim()).toMatch(/'$/);
	});
});

describe("switchModelProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setProviderModel.mockResolvedValue(undefined);
		setProviderInferenceProvider.mockResolvedValue(undefined);
	});

	it("returns 401 when not authenticated", async () => {
		getAuthSession.mockResolvedValueOnce(null);
		const { switchModelProvider } = await import("./telegram");

		const response = await switchModelProvider(
			createContext({ model: "gpt-4o" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(401);
		expect(payload).toEqual({ error: "Unauthorized" });
	});

	it("returns 400 when neither model nor provider is provided", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		const { switchModelProvider } = await import("./telegram");

		const response = await switchModelProvider(createContext({}));
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain("At least one of");
	});

	it("returns 400 for invalid provider", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		const { switchModelProvider } = await import("./telegram");

		const response = await switchModelProvider(
			createContext({ provider: "invalid-provider" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain("Invalid provider");
	});

	it("returns 400 for invalid model string", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		const { switchModelProvider } = await import("./telegram");

		const response = await switchModelProvider(
			createContext({ model: "invalid model with spaces!" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain("Invalid model");
	});

	it("returns 400 when model is not valid for the given provider", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		const { switchModelProvider } = await import("./telegram");

		const response = await switchModelProvider(
			createContext({ provider: "openai", model: "claude-sonnet" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain("not valid for provider");
	});

	it("returns 400 when no active telegram config", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		selectLimit.mockResolvedValueOnce([]);
		const { switchModelProvider } = await import("./telegram");

		const response = await switchModelProvider(
			createContext({ model: "gpt-4o" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain("No active Telegram config");
	});

	it("switches model successfully via SSH", async () => {
		getAuthSession.mockResolvedValueOnce({
			user: { id: "user_123" },
			session: { id: "session_1" },
		});
		selectLimit.mockResolvedValueOnce([
			{
				isActive: true,
				deployedServerId: "server_1",
				deployedServerHost: "192.168.1.1",
				apiServerKey: "enc:api-server-key",
			},
		]);
		getServerByIdMock.mockResolvedValue({
			id: "server_1",
			host: "192.168.1.1",
			port: 22,
			username: "root",
			authMethod: "password",
			encryptedCredential: null,
			storeCredential: false,
		});
		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "test-credential",
		});
		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({});
			},
		);

		const { switchModelProvider } = await import("./telegram");
		const response = await switchModelProvider(
			createContext({ model: "gpt-4o" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({ status: "switched", model: "gpt-4o" });
		expect(setProviderModel).toHaveBeenCalledWith(expect.anything(), "gpt-4o");
		expect(setProviderInferenceProvider).not.toHaveBeenCalled();
	});

	it("switches provider successfully via SSH", async () => {
		getAuthSession.mockResolvedValueOnce({
			user: { id: "user_123" },
			session: { id: "session_1" },
		});
		selectLimit.mockResolvedValueOnce([
			{
				isActive: true,
				deployedServerId: "server_1",
				deployedServerHost: "192.168.1.1",
				apiServerKey: "enc:api-server-key",
			},
		]);
		getServerByIdMock.mockResolvedValue({
			id: "server_1",
			host: "192.168.1.1",
			port: 22,
			username: "root",
			authMethod: "password",
			encryptedCredential: null,
			storeCredential: false,
		});
		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "test-credential",
		});
		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({});
			},
		);

		const { switchModelProvider } = await import("./telegram");
		const response = await switchModelProvider(
			createContext({ provider: "anthropic" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({ status: "switched", provider: "anthropic" });
		expect(setProviderInferenceProvider).toHaveBeenCalledWith(
			expect.anything(),
			"anthropic",
		);
		expect(setProviderModel).not.toHaveBeenCalled();
	});

	it("switches both model and provider via SSH", async () => {
		getAuthSession.mockResolvedValueOnce({
			user: { id: "user_123" },
			session: { id: "session_1" },
		});
		selectLimit.mockResolvedValueOnce([
			{
				isActive: true,
				deployedServerId: "server_1",
				deployedServerHost: "192.168.1.1",
				apiServerKey: "enc:api-server-key",
			},
		]);
		getServerByIdMock.mockResolvedValue({
			id: "server_1",
			host: "192.168.1.1",
			port: 22,
			username: "root",
			authMethod: "password",
			encryptedCredential: null,
			storeCredential: false,
		});
		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "test-credential",
		});
		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({});
			},
		);

		const { switchModelProvider } = await import("./telegram");
		const response = await switchModelProvider(
			createContext({ provider: "openai", model: "gpt-4o" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({
			status: "switched",
			provider: "openai",
			model: "gpt-4o",
		});
		expect(setProviderInferenceProvider).toHaveBeenCalledWith(
			expect.anything(),
			"openai-api",
		);
		expect(setProviderModel).toHaveBeenCalledWith(expect.anything(), "gpt-4o");
	});

	it("returns 502 when SSH connection fails", async () => {
		getAuthSession.mockResolvedValueOnce({
			user: { id: "user_123" },
			session: { id: "session_1" },
		});
		selectLimit.mockResolvedValueOnce([
			{
				isActive: true,
				deployedServerId: "server_1",
				deployedServerHost: "192.168.1.1",
				apiServerKey: "enc:api-server-key",
			},
		]);
		getServerByIdMock.mockResolvedValue({
			id: "server_1",
			host: "192.168.1.1",
			port: 22,
			username: "root",
			authMethod: "password",
			encryptedCredential: null,
			storeCredential: false,
		});
		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "test-credential",
		});
		withSshConnection.mockRejectedValueOnce(
			new Error("SSH connection refused"),
		);

		const { switchModelProvider } = await import("./telegram");
		const response = await switchModelProvider(
			createContext({ model: "gpt-4o" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(502);
		expect(payload.error).toContain("SSH connection refused");
	});
});

function createContext(jsonBody?: unknown) {
	const context = {
		req: {
			raw: {
				headers: new Headers(),
			},
			json: vi.fn().mockResolvedValue(jsonBody),
			header: vi.fn().mockReturnValue(null),
		},
		json: (value: unknown, status = 200) =>
			new Response(JSON.stringify(value), {
				status,
				headers: { "content-type": "application/json" },
			}),
	};

	return context as unknown as Context;
}
