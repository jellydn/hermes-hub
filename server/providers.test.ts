import { beforeEach, describe, expect, it, vi } from "vitest";

import { aiProviders, auditLogs } from "./db/schema";

const getAuthSession = vi.fn();
const encryptSecret = vi.fn();
const decryptSecret = vi.fn();
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

vi.stubGlobal("fetch", fetchMock);

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./crypto", () => ({
	encryptSecret,
	decryptSecret,
}));

vi.mock("./db", () => ({
	getDb: () => ({
		select: dbSelect,
		update: dbUpdate,
		insert: dbInsert,
	}),
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

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({ orderBy: selectOrderBy });
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
				HERMES_INFERENCE_PROVIDER: "custom",
				OPENAI_API_KEY: "stored-api-key",
				OPENAI_BASE_URL: "https://api.deepseek.com/v1",
			},
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
