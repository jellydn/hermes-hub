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
		expect(encryptSecret).toHaveBeenCalledWith("sk-live-secret");
		expect(updateWhere).toHaveBeenCalledTimes(1);
		expect(insertProviderValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user_123",
				provider: "openai",
				model: "gpt-4o-mini",
				encryptedApiKey: "encrypted-api-key",
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
