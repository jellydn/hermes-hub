import { beforeEach, describe, expect, it, vi } from "vitest";

import { aiProviders, auditLogs } from "./db/schema";

const getAuthSession = vi.fn();
const encryptSecret = vi.fn();
const decryptSecret = vi.fn();
const decryptApiServerKey = vi.fn();
const fetchMock = vi.fn();
const dbSelect = vi.fn();
const dbUpdate = vi.fn();
const dbInsert = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn();
const selectFrom = vi.fn();
const selectWhere = vi.fn();
const selectOrderBy = vi.fn();
const selectLimit = vi.fn();
const insertProviderValues = vi.fn();
const insertAuditValues = vi.fn();
const buildHermesComposeContent = vi.fn();
const getServerByIdMock = vi.fn();
const resolveServerSshConfig = vi.fn();
const resolveServerSshConfigOrError = vi.fn();
const withSshConnection = vi.fn();
const shellQuote = vi.fn(
	(value: string) => `'${value.replace(/'/g, "'\\''")}'`,
);

vi.stubGlobal("fetch", fetchMock);

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
		select: dbSelect,
		update: dbUpdate,
		insert: dbInsert,
	}),
}));

vi.mock("./compose", () => ({
	buildHermesComposeContent,
}));

vi.mock("./server-records", () => ({
	getServerById: getServerByIdMock,
	resolveServerSshConfig,
	resolveServerSshConfigOrError,
}));

vi.mock("./ssh", () => ({
	withSshConnection,
	shellQuote,
}));

describe("provider settings", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		getAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});
		encryptSecret.mockReturnValue("encrypted-api-key");
		decryptSecret.mockReturnValue("stored-api-key");
		decryptApiServerKey.mockReturnValue("api-server-key-value");

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		// getServerById chains .where().limit() without .orderBy(),
		// so selectWhere must also expose .limit
		selectWhere.mockReturnValue({
			orderBy: selectOrderBy,
			limit: selectLimit,
		});
		selectOrderBy.mockReturnValue({ limit: selectLimit });
		selectLimit.mockResolvedValue([]);

		dbUpdate.mockReturnValue({ set: updateSet });
		updateSet.mockReturnValue({ where: updateWhere });
		updateWhere.mockResolvedValue(undefined);

		dbInsert.mockImplementation((table) => {
			if (table === aiProviders) {
				return { values: insertProviderValues };
			}

			if (table === auditLogs) {
				return { values: insertAuditValues };
			}

			throw new Error("Unexpected table insert");
		});

		insertProviderValues.mockResolvedValue(undefined);
		insertAuditValues.mockResolvedValue(undefined);
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ data: [] }), { status: 200 }),
		);

		buildHermesComposeContent.mockReturnValue(
			"services:\n  hermes:\n    image: hermes\n",
		);
		resolveServerSshConfig.mockReturnValue({
			authMethod: "ssh-key",
			credential: "mock-credential",
		});
		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "ssh-key",
			credential: "mock-credential",
		});
	});

	it("saves an encrypted provider configuration", async () => {
		const { saveProviderConfig } = await import("./providers");

		const response = await saveProviderConfig(
			createContext("http://localhost/api/providers", {
				provider: "openai",
				model: "gpt-4o-mini",
				apiKey: "sk-live-secret",
			}),
		);

		expect(response.status).toBe(200);
		// API key is now stored directly — no JSON wrapping.
		expect(encryptSecret).toHaveBeenCalledWith("sk-live-secret");
		expect(updateWhere).toHaveBeenCalledTimes(1);
		expect(insertProviderValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user_123",
				provider: "openai",
				model: "gpt-4o-mini",
				encryptedApiKey: "encrypted-api-key",
				baseUrl: null,
				isActive: true,
			}),
		);
		expect(insertAuditValues).toHaveBeenCalledTimes(1);
		expect(await response.json()).toMatchObject({
			provider: {
				provider: "openai",
				model: "gpt-4o-mini",
				keyLast4: "cret",
				hasStoredKey: true,
			},
		});
	});

	it("reuses the stored API key during provider connection tests", async () => {
		selectLimit.mockResolvedValue([
			{
				provider: "openai",
				model: "gpt-4o-mini",
				encryptedApiKey: "encrypted-existing-key",
				baseUrl: null,
			},
		]);

		const { testProviderConfig } = await import("./providers");

		const response = await testProviderConfig(
			createContext("http://localhost/api/providers/test", {
				provider: "openai",
				model: "gpt-4o-mini",
				apiKey: "",
			}),
		);

		expect(response.status).toBe(200);
		expect(decryptSecret).toHaveBeenCalledWith("encrypted-existing-key");
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.openai.com/v1/models",
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: "Bearer stored-api-key",
				}),
			}),
		);
	});

	it("saves and tests Ollama local configuration without API key", async () => {
		const { saveProviderConfig, testProviderConfig } = await import(
			"./providers"
		);

		const saveResponse = await saveProviderConfig(
			createContext("http://localhost/api/providers", {
				provider: "ollama",
				model: "llama3",
				apiKey: "",
				baseUrl: "http://localhost:11434/v1",
			}),
		);

		expect(saveResponse.status).toBe(200);
		// baseUrl is now stored in its own column; the encrypted key is just the
		// API key string (empty for Ollama, which doesn't require one).
		expect(encryptSecret).toHaveBeenCalledWith("");
		expect(insertProviderValues).toHaveBeenCalledWith(
			expect.objectContaining({
				baseUrl: "http://localhost:11434/v1",
			}),
		);
		expect(await saveResponse.json()).toMatchObject({
			provider: {
				provider: "ollama",
				model: "llama3",
				keyLast4: null,
				hasStoredKey: true,
				baseUrl: "http://localhost:11434/v1",
			},
		});

		const testResponse = await testProviderConfig(
			createContext("http://localhost/api/providers/test", {
				provider: "ollama",
				model: "llama3",
				apiKey: "",
				baseUrl: "http://localhost:11434/v1",
			}),
		);

		expect(testResponse.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:11434/v1/models",
			expect.objectContaining({
				method: "GET",
			}),
		);
	});

	it("rejects custom model IDs with shell metacharacters", async () => {
		const { saveProviderConfig } = await import("./providers");

		const response = await saveProviderConfig(
			createContext("http://localhost/api/providers", {
				provider: "openrouter",
				model: "$(rm -rf /)",
				apiKey: "sk-test",
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "Choose a valid model for the selected provider.",
		});
	});

	it("rejects custom model IDs exceeding 120 characters", async () => {
		const { saveProviderConfig } = await import("./providers");

		const response = await saveProviderConfig(
			createContext("http://localhost/api/providers", {
				provider: "openrouter",
				model: "a".repeat(121),
				apiKey: "sk-test",
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "Choose a valid model for the selected provider.",
		});
	});

	it("trims whitespace from custom model IDs before validation", async () => {
		// Model values are trimmed before they reach the validation regex;
		// whitespace padding is accepted and silently stripped.
		const { saveProviderConfig } = await import("./providers");

		const response = await saveProviderConfig(
			createContext("http://localhost/api/providers", {
				provider: "openrouter",
				model: "  openai/gpt-4o  ",
				apiKey: "sk-test",
			}),
		);

		expect(response.status).toBe(200);
	});

	it("rejects model IDs with shell metacharacters for non-custom providers", async () => {
		const { saveProviderConfig } = await import("./providers");

		const response = await saveProviderConfig(
			createContext("http://localhost/api/providers", {
				provider: "openai",
				model: "gpt-4o; rm -rf /",
				apiKey: "sk-test",
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "Choose a valid model for the selected provider.",
		});
	});

	it("saves and tests Custom / BYO provider configuration with API key and baseUrl", async () => {
		const { saveProviderConfig, testProviderConfig } = await import(
			"./providers"
		);

		const saveResponse = await saveProviderConfig(
			createContext("http://localhost/api/providers", {
				provider: "custom",
				model: "deepseek-chat",
				apiKey: "sk-custom-key",
				baseUrl: "https://api.deepseek.com/v1",
			}),
		);

		expect(saveResponse.status).toBe(200);
		// baseUrl is stored in its own column; the key is encrypted directly.
		expect(encryptSecret).toHaveBeenCalledWith("sk-custom-key");
		expect(insertProviderValues).toHaveBeenCalledWith(
			expect.objectContaining({
				baseUrl: "https://api.deepseek.com/v1",
			}),
		);

		const testResponse = await testProviderConfig(
			createContext("http://localhost/api/providers/test", {
				provider: "custom",
				model: "deepseek-chat",
				apiKey: "sk-custom-key",
				baseUrl: "https://api.deepseek.com/v1",
			}),
		);

		expect(testResponse.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.deepseek.com/v1/models",
			expect.objectContaining({
				method: "GET",
				headers: expect.objectContaining({
					Authorization: "Bearer sk-custom-key",
				}),
			}),
		);
	});

	it("builds Hermes deploy env for OpenRouter provider configs", async () => {
		selectLimit.mockResolvedValue([
			{
				provider: "openrouter",
				model: "openai/gpt-4o-mini",
				encryptedApiKey: "encrypted-existing-key",
				baseUrl: null,
			},
		]);

		const { getProviderDeployConfig } = await import("./providers");
		const config = await getProviderDeployConfig("user_123");

		expect(config).toEqual({
			model: "openai/gpt-4o-mini",
			envVars: {
				HERMES_INFERENCE_PROVIDER: "openrouter",
				OPENROUTER_API_KEY: "stored-api-key",
			},
		});
	});

	it("builds Hermes deploy env for custom provider configs", async () => {
		selectLimit.mockResolvedValue([
			{
				provider: "custom",
				model: "deepseek-chat",
				encryptedApiKey: "encrypted-existing-key",
				baseUrl: "https://api.deepseek.com/v1",
			},
		]);

		const { getProviderDeployConfig } = await import("./providers");
		const config = await getProviderDeployConfig("user_123");

		expect(config).toEqual({
			model: "deepseek-chat",
			envVars: {
				CUSTOM_BASE_URL: "https://api.deepseek.com/v1",
				DEEPSEEK_API_KEY: "stored-api-key",
				HERMES_INFERENCE_PROVIDER: "custom",
				OPENAI_API_KEY: "stored-api-key",
				OPENAI_BASE_URL: "https://api.deepseek.com/v1",
			},
		});
	});

	describe("deployProviderToHermes", () => {
		const providerRecord = {
			provider: "openai",
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
			host: "1.2.3.4",
			port: 22,
			username: "root",
			authMethod: "ssh-key",
			encryptedCredential: "encrypted-credential",
			storeCredential: true,
		};

		beforeEach(() => {
			getServerByIdMock.mockResolvedValue(serverRecord);
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

		it("returns 400 when no provider record exists", async () => {
			// selectLimit already defaults to [] from beforeEach
			const { deployProviderToHermes } = await import("./deploy");
			const response = await deployProviderToHermes(
				createContext("http://localhost/api/providers/deploy", {}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "No provider config found. Save a provider first.",
			});
		});

		it("returns 400 when no Telegram deploy info exists", async () => {
			selectLimit
				.mockResolvedValueOnce([providerRecord])
				.mockResolvedValueOnce([]);

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
			getServerByIdMock.mockResolvedValue(null);
			selectLimit
				.mockResolvedValueOnce([providerRecord])
				.mockResolvedValueOnce([telegramRecord]);

			const { deployProviderToHermes } = await import("./deploy");
			const response = await deployProviderToHermes(
				createContext("http://localhost/api/providers/deploy", {}),
			);

			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({
				error: "Deployed server not found.",
			});
		});

		it("returns 500 when bot token decryption fails", async () => {
			selectLimit
				.mockResolvedValueOnce([providerRecord])
				.mockResolvedValueOnce([telegramRecord]);
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

		it("returns 502 when SSH compose write fails", async () => {
			const sshExecCommand = vi
				.fn()
				.mockResolvedValue({ code: 1, stdout: "", stderr: "Write failed" });
			withSshConnection.mockImplementation(async (_input, callback) => {
				await callback({ execCommand: sshExecCommand });
			});

			selectLimit
				.mockResolvedValueOnce([providerRecord])
				.mockResolvedValueOnce([telegramRecord]);

			const { deployProviderToHermes } = await import("./deploy");
			const response = await deployProviderToHermes(
				createContext("http://localhost/api/providers/deploy", {}),
			);

			expect(response.status).toBe(502);
			expect(await response.json()).toMatchObject({
				error: "Deploy failed: Write failed",
			});
		});

		it("returns 200 on successful deploy and logs all side effects", async () => {
			const sshExecCommand = vi
				.fn()
				.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
			withSshConnection.mockImplementation(async (_input, callback) => {
				await callback({ execCommand: sshExecCommand });
			});

			selectLimit
				.mockResolvedValueOnce([providerRecord])
				.mockResolvedValueOnce([telegramRecord]);

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

			// buildHermesComposeContent was called with the right arguments
			expect(buildHermesComposeContent).toHaveBeenCalledWith({
				apiServerKey: "api-server-key-value",
				telegramBotToken: "stored-api-key",
				providerEnvVars: {
					HERMES_INFERENCE_PROVIDER: "openai-api",
					OPENAI_API_KEY: "stored-api-key",
				},
				hermesModel: "gpt-4o",
			});

			// resolveServerSshConfigOrError was called with the server ID and session ID
			expect(resolveServerSshConfigOrError).toHaveBeenCalledWith(
				expect.objectContaining({ id: "server_1", host: "1.2.3.4" }),
				"session_123",
			);

			// withSshConnection was called with host/port/username
			expect(withSshConnection).toHaveBeenCalledWith(
				expect.objectContaining({
					host: "1.2.3.4",
					port: 22,
					username: "root",
					authMethod: "ssh-key",
					credential: "mock-credential",
				}),
				expect.any(Function),
			);

			// SSH exec commands: write compose, docker compose up, sleep, set model
			expect(sshExecCommand).toHaveBeenCalledTimes(4);
			expect(sshExecCommand).toHaveBeenNthCalledWith(
				1,
				expect.stringContaining("cat > ~/hermes/docker-compose.yml"),
			);
			expect(sshExecCommand).toHaveBeenNthCalledWith(
				2,
				"cd ~/hermes && sudo docker compose up -d --force-recreate",
			);
			expect(sshExecCommand).toHaveBeenNthCalledWith(3, "sleep 2");
			expect(sshExecCommand).toHaveBeenNthCalledWith(
				4,
				expect.stringContaining(
					"docker exec hermes hermes config set model 'gpt-4o'",
				),
			);

			// shellQuote was called with the model
			expect(shellQuote).toHaveBeenCalledWith("gpt-4o");

			// Audit log was written with success action
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
