import { beforeEach, describe, expect, it, vi } from "vitest";

import { aiProviders, aiUserSubscriptions, auditLogs } from "./db/schema";

const getAuthSession = vi.fn();
const encryptSecret = vi.fn();
const decryptSecret = vi.fn();
const decryptApiServerKey = vi.fn();
const fetchMock = vi.fn();
const dbSelect = vi.fn();
const dbUpdate = vi.fn();
const dbInsert = vi.fn();
const transaction = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn();
const selectFrom = vi.fn();
const selectWhere = vi.fn();
const selectOrderBy = vi.fn();
const selectLimit = vi.fn();
const insertProviderValues = vi.fn();
const insertSubscriptionValues = vi.fn();
const insertAuditValues = vi.fn();
const loadModelAccessRecords = vi.fn();

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
		transaction,
	}),
}));

vi.mock("./providers/model-access", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("./providers/model-access")>();
	return {
		...actual,
		loadModelAccessRecords,
	};
});

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

			if (table === aiUserSubscriptions) {
				return { values: insertSubscriptionValues };
			}

			if (table === auditLogs) {
				return { values: insertAuditValues };
			}

			throw new Error("Unexpected table insert");
		});

		insertProviderValues.mockResolvedValue(undefined);
		insertSubscriptionValues.mockResolvedValue(undefined);
		insertAuditValues.mockResolvedValue(undefined);
		transaction.mockImplementation(async (fn) =>
			fn({
				update: dbUpdate,
				insert: dbInsert,
			}),
		);
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ data: [] }), { status: 200 }),
		);
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
		expect(updateWhere).toHaveBeenCalledTimes(2);
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

	it("saves custom (non-listed) model IDs for fixed-list providers", async () => {
		const { saveProviderConfig } = await import("./providers");

		const response = await saveProviderConfig(
			createContext("http://localhost/api/providers", {
				provider: "openai",
				model: "gpt-5.6-luna",
				apiKey: "sk-test",
			}),
		);

		expect(response.status).toBe(200);
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
		mockActiveApiProviderLookup([
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

	it("saves ChatGPT subscription configuration", async () => {
		const { saveSubscriptionConfig } = await import("./providers");

		const saveResponse = await saveSubscriptionConfig(
			createContext("http://localhost/api/providers/subscriptions", {
				subscriptionProvider: "chatgpt",
				model: "gpt-5.5",
			}),
		);

		expect(saveResponse.status).toBe(200);
		expect(encryptSecret).not.toHaveBeenCalled();
		expect(updateWhere).toHaveBeenCalledTimes(2);
		expect(insertSubscriptionValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user_123",
				subscriptionProvider: "chatgpt",
				model: "gpt-5.5",
				authMode: "chatgpt",
				isActive: true,
			}),
		);
		expect(insertProviderValues).not.toHaveBeenCalled();
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "subscription.saved",
			}),
		);
		expect(await saveResponse.json()).toMatchObject({
			subscription: {
				kind: "subscription",
				subscriptionProvider: "chatgpt",
				model: "gpt-5.5",
				authMode: "chatgpt",
			},
		});
	});

	it("rejects invalid ChatGPT subscription model IDs", async () => {
		const { saveSubscriptionConfig } = await import("./providers");

		const response = await saveSubscriptionConfig(
			createContext("http://localhost/api/providers/subscriptions", {
				subscriptionProvider: "chatgpt",
				model: "gpt-4o; rm -rf /",
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "Choose a valid model for the selected subscription.",
		});
	});

	it("saves custom (non-listed) ChatGPT subscription model IDs", async () => {
		const { saveSubscriptionConfig } = await import("./providers");

		const response = await saveSubscriptionConfig(
			createContext("http://localhost/api/providers/subscriptions", {
				subscriptionProvider: "chatgpt",
				model: "gpt-5.6-luna",
				authMode: "chatgpt",
			}),
		);

		expect(response.status).toBe(200);
	});

	it("builds Hermes deploy env for ChatGPT subscription without decrypting API keys", async () => {
		mockActiveSubscriptionLookup({
			subscriptionProvider: "chatgpt",
			model: "gpt-5.5",
			authMode: "chatgpt",
		});

		const { getProviderDeployConfig } = await import("./providers");
		const config = await getProviderDeployConfig("user_123");

		expect(config).toEqual({
			model: "gpt-5.5",
			envVars: {
				HERMES_INFERENCE_PROVIDER: "openai-codex",
			},
		});
		expect(decryptSecret).not.toHaveBeenCalled();
	});

	it("builds Hermes deploy env for custom provider configs", async () => {
		mockActiveApiProviderLookup([
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

	it("builds Hermes deploy env for custom providers with an empty stored key", async () => {
		decryptSecret.mockImplementation((value: string) => {
			if (value === "encrypted-empty-key") {
				return "";
			}

			return "stored-api-key";
		});
		mockActiveApiProviderLookup([
			{
				provider: "custom",
				model: "deepseek-chat",
				encryptedApiKey: "encrypted-empty-key",
				baseUrl: "https://api.deepseek.com/v1",
			},
		]);

		const { getProviderDeployConfig } = await import("./providers");
		const config = await getProviderDeployConfig("user_123");

		expect(config).toEqual({
			model: "deepseek-chat",
			envVars: {
				CUSTOM_BASE_URL: "https://api.deepseek.com/v1",
				HERMES_INFERENCE_PROVIDER: "custom",
				OPENAI_BASE_URL: "https://api.deepseek.com/v1",
			},
		});
	});

	it("saves and tests MiMo Token Plan credentials via subscription endpoints", async () => {
		const { saveSubscriptionConfig, testSubscriptionConfig } = await import(
			"./providers"
		);

		const saveResponse = await saveSubscriptionConfig(
			createContext("http://localhost/api/providers/subscriptions", {
				subscriptionProvider: "mimo",
				model: "mimo-v2.5-pro",
				apiKey: "tp-live-secret",
				baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
			}),
		);

		expect(saveResponse.status).toBe(200);
		expect(encryptSecret).toHaveBeenCalledWith("tp-live-secret");
		expect(insertProviderValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user_123",
				provider: "mimo",
				model: "mimo-v2.5-pro",
				encryptedApiKey: "encrypted-api-key",
				baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
				isActive: true,
			}),
		);
		expect(insertSubscriptionValues).not.toHaveBeenCalled();
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "subscription.saved",
			}),
		);
		expect(await saveResponse.json()).toMatchObject({
			subscription: {
				kind: "subscription",
				subscriptionProvider: "mimo",
				model: "mimo-v2.5-pro",
				authMode: "mimo-token-plan",
				keyLast4: "cret",
				hasStoredKey: true,
				baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
			},
		});

		const testResponse = await testSubscriptionConfig(
			createContext("http://localhost/api/providers/subscriptions/test", {
				subscriptionProvider: "mimo",
				model: "mimo-v2.5-pro",
				apiKey: "tp-live-secret",
				baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
			}),
		);

		expect(testResponse.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://token-plan-cn.xiaomimimo.com/v1/models",
			expect.objectContaining({
				method: "GET",
				headers: expect.objectContaining({
					Authorization: "Bearer tp-live-secret",
				}),
			}),
		);
	});

	it("tests Command Code Coding Plan credentials with a real CLI generation", async () => {
		const previousAuthUrl = process.env.BETTER_AUTH_URL;
		process.env.BETTER_AUTH_URL = "https://hub.example.com";
		fetchMock.mockResolvedValueOnce(
			new Response(
				`${JSON.stringify({ type: "text-delta", text: "O" })}\n${JSON.stringify(
					{ type: "finish", finishReason: "length" },
				)}\n`,
				{ status: 200 },
			),
		);

		try {
			const { saveSubscriptionConfig, testSubscriptionConfig } = await import(
				"./providers"
			);
			const saveResponse = await saveSubscriptionConfig(
				createContext("http://localhost/api/providers/subscriptions", {
					subscriptionProvider: "commandcode",
					model: "deepseek/deepseek-v4-flash",
					apiKey: "user_live_secret",
					baseUrl: "https://api.commandcode.ai/provider/v1",
				}),
			);
			const response = await testSubscriptionConfig(
				createContext("http://localhost/api/providers/subscriptions/test", {
					subscriptionProvider: "commandcode",
					model: "deepseek/deepseek-v4-flash",
					apiKey: "user_live_secret",
					baseUrl: "https://api.commandcode.ai/provider/v1",
				}),
			);

			expect(saveResponse.status).toBe(200);
			expect(insertProviderValues).toHaveBeenCalledWith(
				expect.objectContaining({
					provider: "commandcode",
					baseUrl: "https://hub.example.com/api/commandcode-proxy/v1",
				}),
			);
			expect(response.status).toBe(200);
			expect(fetchMock).toHaveBeenCalledWith(
				"https://api.commandcode.ai/alpha/generate",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						Authorization: "Bearer user_live_secret",
						"x-command-code-version": "0.29.0",
					}),
				}),
			);
			const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(JSON.parse(String(init.body))).toMatchObject({
				params: {
					model: "deepseek/deepseek-v4-flash",
					max_tokens: 1,
					stream: true,
				},
			});
		} finally {
			if (previousAuthUrl === undefined) {
				delete process.env.BETTER_AUTH_URL;
			} else {
				process.env.BETTER_AUTH_URL = previousAuthUrl;
			}
		}
	});

	it("builds Hermes deploy env for MiMo Token Plan", async () => {
		loadModelAccessRecords.mockResolvedValueOnce({
			apiRecord: {
				provider: "mimo",
				model: "mimo-v2.5-pro",
				encryptedApiKey: "encrypted-existing-key",
				baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
				isActive: true,
			},
			subscriptionRecord: null,
			activeBackend: {
				kind: "subscription",
				access: "credential",
				subscriptionProvider: "mimo",
				model: "mimo-v2.5-pro",
				authMode: "mimo-token-plan",
				hermesProviderId: "xiaomi",
				storageProviderId: "mimo",
				encryptedApiKey: "encrypted-existing-key",
				baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
			},
		});

		const { getProviderDeployConfig } = await import("./providers");
		const config = await getProviderDeployConfig("user_123");

		expect(config).toEqual({
			model: "mimo-v2.5-pro",
			envVars: {
				HERMES_INFERENCE_PROVIDER: "xiaomi",
				XIAOMI_API_KEY: "stored-api-key",
				XIAOMI_BASE_URL: "https://token-plan-cn.xiaomimimo.com/v1",
			},
		});
	});

	it("builds Hermes deploy env for Command Code Coding Plan", async () => {
		const previousAuthUrl = process.env.BETTER_AUTH_URL;
		process.env.BETTER_AUTH_URL = "https://hub.example.com";
		loadModelAccessRecords.mockResolvedValueOnce({
			apiRecord: null,
			subscriptionRecord: {
				subscriptionProvider: "commandcode",
				model: "deepseek/deepseek-v4-flash",
				authMode: "coding-plan",
				hermesProviderId: "custom",
				storageProviderId: "commandcode",
				encryptedApiKey: "encrypted-existing-key",
				baseUrl: "https://api.commandcode.ai/provider/v1",
			},
			activeBackend: {
				kind: "subscription",
				access: "credential",
				subscriptionProvider: "commandcode",
				model: "deepseek/deepseek-v4-flash",
				authMode: "coding-plan",
				hermesProviderId: "custom",
				storageProviderId: "commandcode",
				encryptedApiKey: "encrypted-existing-key",
				baseUrl: "https://api.commandcode.ai/provider/v1",
			},
		});

		try {
			const { getProviderDeployConfig } = await import("./providers");
			const config = await getProviderDeployConfig("user_123");

			expect(config).toEqual({
				model: "deepseek/deepseek-v4-flash",
				envVars: {
					HERMES_INFERENCE_PROVIDER: "custom",
					COMMANDCODE_API_KEY: "stored-api-key",
					COMMANDCODE_BASE_URL:
						"https://hub.example.com/api/commandcode-proxy/v1",
					OPENAI_API_KEY: "stored-api-key",
					CUSTOM_BASE_URL: "https://hub.example.com/api/commandcode-proxy/v1",
					OPENAI_BASE_URL: "https://hub.example.com/api/commandcode-proxy/v1",
				},
			});
		} finally {
			if (previousAuthUrl === undefined) {
				delete process.env.BETTER_AUTH_URL;
			} else {
				process.env.BETTER_AUTH_URL = previousAuthUrl;
			}
		}
	});

	it("rejects deploy config when stored API-key ciphertext is unreadable", async () => {
		decryptSecret.mockImplementation((value: string) => {
			if (value === "corrupt-ciphertext") {
				throw new Error("decrypt failed");
			}

			return "stored-api-key";
		});
		mockActiveApiProviderLookup([
			{
				provider: "openai",
				model: "gpt-4o",
				encryptedApiKey: "corrupt-ciphertext",
				baseUrl: null,
			},
		]);

		const { getProviderDeployConfig } = await import("./providers");

		await expect(getProviderDeployConfig("user_123")).rejects.toThrow(
			"Stored API key could not be read. Paste a new key.",
		);
	});
});

function mockActiveSubscriptionLookup(subscription: {
	subscriptionProvider: "chatgpt";
	model: string;
	authMode: string;
}) {
	const subscriptionRecord = {
		...subscription,
		isActive: true,
	};

	loadModelAccessRecords.mockResolvedValueOnce({
		apiRecord: null,
		subscriptionRecord,
		activeBackend: {
			kind: "subscription",
			access: "oauth",
			subscriptionProvider: subscription.subscriptionProvider,
			model: subscription.model,
			authMode: subscription.authMode,
			hermesProviderId: "openai-codex",
		},
	});
}

function mockActiveApiProviderLookup(
	providers: Array<{
		provider: "openai" | "anthropic" | "openrouter" | "ollama" | "custom";
		model: string;
		encryptedApiKey: string;
		baseUrl: string | null;
		isActive?: boolean;
	}>,
) {
	const apiRecord = {
		...providers[0],
		isActive: providers[0]?.isActive ?? true,
	};

	loadModelAccessRecords.mockResolvedValueOnce({
		apiRecord,
		subscriptionRecord: null,
		activeBackend: apiRecord.isActive
			? {
					kind: "api-provider",
					provider: apiRecord.provider,
					model: apiRecord.model,
					encryptedApiKey: apiRecord.encryptedApiKey,
					baseUrl: apiRecord.baseUrl,
				}
			: null,
	});
}

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
