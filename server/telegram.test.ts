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
const loadModelAccessRecords = vi.fn();

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
	aiProviders: {
		id: Symbol("aiProviders.id"),
		userId: Symbol("aiProviders.userId"),
		provider: Symbol("aiProviders.provider"),
		encryptedApiKey: Symbol("aiProviders.encryptedApiKey"),
		baseUrl: Symbol("aiProviders.baseUrl"),
		model: Symbol("aiProviders.model"),
		isActive: Symbol("aiProviders.isActive"),
		createdAt: Symbol("aiProviders.createdAt"),
	},
	aiUserSubscriptions: {
		id: Symbol("aiUserSubscriptions.id"),
		userId: Symbol("aiUserSubscriptions.userId"),
		subscriptionProvider: Symbol("aiUserSubscriptions.subscriptionProvider"),
		model: Symbol("aiUserSubscriptions.model"),
		authMode: Symbol("aiUserSubscriptions.authMode"),
		isActive: Symbol("aiUserSubscriptions.isActive"),
		createdAt: Symbol("aiUserSubscriptions.createdAt"),
		updatedAt: Symbol("aiUserSubscriptions.updatedAt"),
	},
}));

vi.mock("./ssh", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./ssh")>();
	return {
		...actual,
		withSshConnection,
		shellQuote: (value: string) => `'${value.replace(/'/g, "'\\''")}'`,
	};
});

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

vi.mock("./providers/active-backend", () => ({
	loadModelAccessRecords,
}));

const resolveSwitchOptionMock = vi.fn();
const executeModelSwitchMock = vi.fn();

vi.mock("./telegram/model-access", () => ({
	resolveSwitchOption: resolveSwitchOptionMock,
	getModelAccessOptions: vi.fn(),
	findActiveOptionIds: vi.fn(),
}));

vi.mock("./telegram/model-switch", () => ({
	executeModelSwitch: executeModelSwitchMock,
}));

const setProviderModel = vi.fn();
const setProviderInferenceProvider = vi.fn();
const writeComposeFile = vi.fn();
const composeUp = vi.fn();
const buildManagedComposeContent = vi.fn();

vi.mock("./hermes/runtime", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./hermes/runtime")>();
	return {
		...actual,
		setProviderModel,
		setProviderInferenceProvider,
		writeComposeFile,
		composeUp,
	};
});

vi.mock("./server-compose", () => ({
	buildManagedComposeContent,
}));

vi.mock("#/lib/ai-providers", () => ({
	getDefaultAiModel: (provider: string) => {
		const defaults: Record<string, string> = {
			openai: "gpt-4o",
			anthropic: "claude-sonnet-4-20250514",
			openrouter: "gpt-4o",
			ollama: "llama3",
			custom: "gpt-4o",
		};
		return defaults[provider] ?? "";
	},
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
		loadModelAccessRecords.mockResolvedValue({ activeBackend: null });
		writeComposeFile.mockResolvedValue(undefined);
		composeUp.mockResolvedValue(undefined);
		buildManagedComposeContent.mockResolvedValue("services:\n  hermes: {}");
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

		selectLimit.mockResolvedValue([
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

	it("returns 409 with hostKey details when deploy throws host_key_missing", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});

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

		// Server with NULL hostKeyFingerprint — causes host_key_missing
		selectLimit.mockResolvedValueOnce([
			{
				id: "server_1",
				host: "1.2.3.4",
				port: 22,
				username: "root",
				authMethod: "password",
				encryptedCredential: null,
				storeCredential: false,
				hostKeyFingerprint: null,
			},
		]);

		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "test-credential",
		});

		const { SshConnectError } = await import("./ssh");
		deployManagedCompose.mockRejectedValueOnce(
			new SshConnectError(
				"host key pin required but not stored",
				"host_key_missing",
				{ fingerprint: "SHA256:abc123", algorithm: "ssh-ed25519" },
			),
		);

		const { deployTelegramToServer } = await import("./telegram");
		const response = await deployTelegramToServer(
			createContext() as unknown as Context,
		);
		const payload = await response.json();

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

		// No audit log for recoverable errors
		expect(insertValues).not.toHaveBeenCalled();
		// No deploy state persisted
		expect(updateSet).not.toHaveBeenCalled();
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

	it("returns 409 with hostKey details when testTelegramBot SSH throws host_key_missing", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});

		getProviderDeployConfig.mockResolvedValue({
			envVars: { HERMES_INFERENCE_PROVIDER: "openai" },
			model: "gpt-4o",
		});

		selectLimit.mockResolvedValue([
			{
				botToken: "enc:123456:secret-token",
				botUsername: "hermes_helper_bot",
				isActive: true,
				deployedServerId: "server_1",
				deployedServerHost: "192.168.1.1",
				apiServerKey: "enc:api-server-key",
			},
		]);

		// Server with NULL hostKeyFingerprint
		getServerByIdMock.mockResolvedValue({
			id: "server_1",
			host: "192.168.1.1",
			port: 22,
			username: "root",
			authMethod: "password",
			encryptedCredential: null,
			storeCredential: false,
			hostKeyFingerprint: null,
		});

		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "test-credential",
		});

		const { SshConnectError } = await import("./ssh");
		withSshConnection.mockRejectedValueOnce(
			new SshConnectError(
				"host key pin required but not stored",
				"host_key_missing",
				{ fingerprint: "SHA256:xyz789", algorithm: "ssh-ed25519" },
			),
		);

		const { testTelegramBot } = await import("./telegram");
		const response = await testTelegramBot(createContext({ message: "Hello" }));
		const payload = await response.json();

		expect(response.status).toBe(409);
		expect(payload).toMatchObject({
			code: "host_key_missing",
			serverId: "server_1",
			serverHost: "192.168.1.1",
			hostKey: {
				observedFingerprint: "SHA256:xyz789",
				observedAlgorithm: "ssh-ed25519",
			},
		});
		expect(payload.error).toContain("Host key fingerprint not stored");
	});
});

describe("switchModelProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setProviderModel.mockResolvedValue(undefined);
		setProviderInferenceProvider.mockResolvedValue(undefined);
		resolveSwitchOptionMock.mockReset();
		executeModelSwitchMock.mockReset();
		executeModelSwitchMock.mockResolvedValue(undefined);

		// Re-establish default mock chain that the outer beforeEach sets up,
		// because vi.clearAllMocks() clears all mock implementations.
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
		loadModelAccessRecords.mockResolvedValue({ activeBackend: null });
		writeComposeFile.mockResolvedValue(undefined);
		composeUp.mockResolvedValue(undefined);
		buildManagedComposeContent.mockResolvedValue("services:\n  hermes: {}");
		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: unknown) => Promise<unknown>,
			) => {
				return callback({});
			},
		);
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

	it("returns 401 when not authenticated", async () => {
		getAuthSession.mockResolvedValueOnce(null);
		const { switchModelProvider } = await import("./telegram");

		const response = await switchModelProvider(
			createContext({ optionId: "api-provider:abc123", model: "gpt-4o" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(401);
		expect(payload).toEqual({ error: "Unauthorized" });
	});

	it("returns 400 when optionId is missing", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		const { switchModelProvider } = await import("./telegram");

		const response = await switchModelProvider(createContext({}));
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain("'optionId' is required");
	});

	it("returns 400 when model is missing", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		const { switchModelProvider } = await import("./telegram");

		const response = await switchModelProvider(
			createContext({ optionId: "api-provider:abc123" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain("'model' is required");
	});

	it("returns 400 for invalid model string", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		const { switchModelProvider } = await import("./telegram");

		const response = await switchModelProvider(
			createContext({
				optionId: "api-provider:abc123",
				model: "invalid model with spaces!",
			}),
		);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain("Invalid model");
	});

	it("returns 400 when option ID is invalid", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		resolveSwitchOptionMock.mockResolvedValueOnce({
			ok: false,
			error: "Option not found.",
		});
		const { switchModelProvider } = await import("./telegram");

		const response = await switchModelProvider(
			createContext({ optionId: "api-provider:nonexistent", model: "gpt-4o" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain("Option not found");
	});

	it("returns 400 when model is not valid for the given option", async () => {
		getAuthSession.mockResolvedValueOnce({ user: { id: "user_123" } });
		resolveSwitchOptionMock.mockResolvedValueOnce({
			ok: true,
			kind: "api-provider",
			provider: "openai",
			hermesProviderId: "openai-api",
			model: "gpt-4o",
			allowsCustomModel: false,
			fixedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
			activeOptionIds: { providerIds: [], subscriptionIds: [] },
		});
		const { switchModelProvider } = await import("./telegram");
		const response = await switchModelProvider(
			createContext({
				optionId: "api-provider:abc123",
				model: "claude-sonnet",
			}),
		);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain("not valid for");
	});

	it("switches model successfully via SSH", async () => {
		getAuthSession.mockResolvedValueOnce({
			user: { id: "user_123" },
			session: { id: "session_1" },
		});
		resolveSwitchOptionMock.mockResolvedValueOnce({
			ok: true,
			kind: "api-provider",
			provider: "openai",
			hermesProviderId: "openai-api",
			model: "gpt-4o",
			allowsCustomModel: false,
			fixedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
			activeOptionIds: { providerIds: ["other-row-id"], subscriptionIds: [] },
		});
		// resolveTelegramSshContext -> getLatestTelegramRecord
		selectLimit.mockResolvedValue([
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
		transaction.mockImplementation(async (fn) => {
			const tx = {
				update: () => ({ set: () => ({ where: updateWhere }) }),
				insert: () => ({ values: insertValues }),
			};
			return fn(tx);
		});

		const { switchModelProvider } = await import("./telegram");
		const response = await switchModelProvider(
			createContext({ optionId: "api-provider:abc123", model: "gpt-4o" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({
			status: "switched",
			optionId: "api-provider:abc123",
			model: "gpt-4o",
			provider: "openai",
		});
		expect(executeModelSwitchMock).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user_123",
				optionId: "api-provider:abc123",
				model: "gpt-4o",
				resolved: expect.objectContaining({
					hermesProviderId: "openai-api",
				}),
			}),
		);
	});

	it("switches subscription option successfully via SSH", async () => {
		getAuthSession.mockResolvedValueOnce({
			user: { id: "user_123" },
			session: { id: "session_1" },
		});
		resolveSwitchOptionMock.mockResolvedValueOnce({
			ok: true,
			kind: "credential-subscription",
			provider: "mimo",
			hermesProviderId: "xiaomi",
			model: "mimo-v2.5-pro",
			allowsCustomModel: false,
			fixedModels: ["mimo-v2.5-pro", "mimo-v2.5"],
			activeOptionIds: { providerIds: ["other-row-id"], subscriptionIds: [] },
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
		transaction.mockImplementation(async (fn) => {
			const tx = {
				update: () => ({ set: () => ({ where: updateWhere }) }),
				insert: () => ({ values: insertValues }),
			};
			return fn(tx);
		});

		const { switchModelProvider } = await import("./telegram");
		const response = await switchModelProvider(
			createContext({
				optionId: "credential-subscription:def456",
				model: "mimo-v2.5",
			}),
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toEqual({
			status: "switched",
			optionId: "credential-subscription:def456",
			model: "mimo-v2.5",
			provider: "mimo",
		});
		expect(executeModelSwitchMock).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user_123",
				optionId: "credential-subscription:def456",
				model: "mimo-v2.5",
				resolved: expect.objectContaining({
					hermesProviderId: "xiaomi",
				}),
			}),
		);
	});

	it("returns 502 when SSH connection fails", async () => {
		getAuthSession.mockResolvedValueOnce({
			user: { id: "user_123" },
			session: { id: "session_1" },
		});
		resolveSwitchOptionMock.mockResolvedValueOnce({
			ok: true,
			kind: "api-provider",
			provider: "openai",
			hermesProviderId: "openai-api",
			model: "gpt-4o",
			allowsCustomModel: false,
			fixedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
			activeOptionIds: { providerIds: [], subscriptionIds: [] },
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
		executeModelSwitchMock.mockRejectedValueOnce(
			new Error("SSH connection refused"),
		);

		const { switchModelProvider } = await import("./telegram");
		const response = await switchModelProvider(
			createContext({ optionId: "api-provider:abc123", model: "gpt-4o" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(502);
		expect(payload.error).toContain("SSH connection refused");
	});

	it("returns 409 with hostKey details when executeModelSwitch throws host_key_missing", async () => {
		getAuthSession.mockResolvedValueOnce({
			user: { id: "user_123" },
			session: { id: "session_1" },
		});
		resolveSwitchOptionMock.mockResolvedValueOnce({
			ok: true,
			kind: "api-provider",
			provider: "openai",
			hermesProviderId: "openai-api",
			model: "gpt-4o",
			allowsCustomModel: false,
			fixedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
			activeOptionIds: { providerIds: [], subscriptionIds: [] },
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

		const { SshConnectError } = await import("./ssh");
		executeModelSwitchMock.mockRejectedValueOnce(
			new SshConnectError(
				"host key pin required but not stored",
				"host_key_missing",
				{ fingerprint: "SHA256:abc123", algorithm: "ssh-ed25519" },
			),
		);

		const { switchModelProvider } = await import("./telegram");
		const response = await switchModelProvider(
			createContext({ optionId: "api-provider:abc123", model: "gpt-4o" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(409);
		expect(payload).toMatchObject({
			code: "host_key_missing",
			serverId: "server_1",
			serverHost: "192.168.1.1",
			hostKey: {
				observedFingerprint: "SHA256:abc123",
				observedAlgorithm: "ssh-ed25519",
			},
		});
		expect(payload.error).toContain("Host key fingerprint not stored");
	});

	it("returns 409 with expectedFingerprint when executeModelSwitch throws host_key_mismatch", async () => {
		getAuthSession.mockResolvedValueOnce({
			user: { id: "user_123" },
			session: { id: "session_1" },
		});
		resolveSwitchOptionMock.mockResolvedValueOnce({
			ok: true,
			kind: "api-provider",
			provider: "openai",
			hermesProviderId: "openai-api",
			model: "gpt-4o",
			allowsCustomModel: false,
			fixedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
			activeOptionIds: { providerIds: [], subscriptionIds: [] },
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
			// Simulate a stored host-key pin that the observed key doesn't match
			hostKeyFingerprint: "SHA256:stored-pin",
		});
		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "test-credential",
		});

		const { SshConnectError } = await import("./ssh");
		executeModelSwitchMock.mockRejectedValueOnce(
			new SshConnectError("host key mismatch", "host_key_mismatch", {
				fingerprint: "SHA256:observed-key",
				algorithm: "ssh-ed25519",
			}),
		);

		const { switchModelProvider } = await import("./telegram");
		const response = await switchModelProvider(
			createContext({ optionId: "api-provider:abc123", model: "gpt-4o" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(409);
		expect(payload).toMatchObject({
			code: "host_key_mismatch",
			serverId: "server_1",
			serverHost: "192.168.1.1",
			hostKey: {
				observedFingerprint: "SHA256:observed-key",
				observedAlgorithm: "ssh-ed25519",
				expectedFingerprint: "SHA256:stored-pin",
			},
		});
	});

	it("still returns 502 for generic SSH errors", async () => {
		getAuthSession.mockResolvedValueOnce({
			user: { id: "user_123" },
			session: { id: "session_1" },
		});
		resolveSwitchOptionMock.mockResolvedValueOnce({
			ok: true,
			kind: "api-provider",
			provider: "openai",
			hermesProviderId: "openai-api",
			model: "gpt-4o",
			allowsCustomModel: false,
			fixedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
			activeOptionIds: { providerIds: [], subscriptionIds: [] },
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

		const { SshConnectError } = await import("./ssh");
		executeModelSwitchMock.mockRejectedValueOnce(
			new SshConnectError("Connection timed out", "host_unreachable"),
		);

		const { switchModelProvider } = await import("./telegram");
		const response = await switchModelProvider(
			createContext({ optionId: "api-provider:abc123", model: "gpt-4o" }),
		);
		const payload = await response.json();

		expect(response.status).toBe(502);
		expect(payload.error).toContain("Connection timed out");
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
