import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditLogs, hermesSettings } from "./db/schema";

const getAuthSession = vi.fn();
const dbSelect = vi.fn();
const dbInsert = vi.fn();
const transaction = vi.fn();
const selectFrom = vi.fn();
const selectWhere = vi.fn();
const selectOrderBy = vi.fn();
const selectLimit = vi.fn();
const insertValues = vi.fn();
const onConflictDoUpdate = vi.fn();
const insertAuditValues = vi.fn();
const withSshConnection = vi.fn();
const writeSoulMd = vi.fn();
const restartGateway = vi.fn();
const getOwnedServerRecordMock = vi.fn();
const resolveServerSshConfigOrError = vi.fn();

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./db", () => ({
	getDb: () => ({
		select: dbSelect,
		insert: dbInsert,
		transaction,
	}),
}));

vi.mock("./ssh", () => ({
	withSshConnection,
}));

vi.mock("./hermes/persona", () => ({
	validateAgentPersona: (content: string) => {
		const trimmed = content.trim();
		if (!trimmed) {
			return { ok: false, error: "Persona content cannot be empty." };
		}
		if (trimmed.length > 20_000) {
			return {
				ok: false,
				error: "Persona content cannot exceed 20000 characters.",
			};
		}
		return { ok: true, content: trimmed };
	},
	writeSoulMd,
}));

vi.mock("./hermes/runtime", () => ({
	restartGateway,
}));

vi.mock("./server-records", () => ({
	getOwnedServerRecord: getOwnedServerRecordMock,
	resolveServerSshConfigOrError,
}));

describe("persona settings", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		getAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({
			orderBy: selectOrderBy,
			limit: selectLimit,
		});
		selectOrderBy.mockReturnValue({ limit: selectLimit });
		selectLimit.mockResolvedValue([]);

		dbInsert.mockImplementation((table) => {
			if (table === hermesSettings) {
				return { values: insertValues };
			}

			if (table === auditLogs) {
				return { values: insertAuditValues };
			}

			throw new Error("Unexpected table insert");
		});

		insertValues.mockReturnValue({ onConflictDoUpdate });
		onConflictDoUpdate.mockResolvedValue(undefined);
		insertAuditValues.mockResolvedValue(undefined);
		transaction.mockImplementation(async (fn) =>
			fn({
				insert: dbInsert,
			}),
		);

		withSshConnection.mockImplementation(
			async (
				_config: unknown,
				callback: (ssh: {
					execCommand: () => Promise<unknown>;
				}) => Promise<void>,
			) => callback({ execCommand: vi.fn() }),
		);
		writeSoulMd.mockResolvedValue(undefined);
		restartGateway.mockResolvedValue("restarted");

		getOwnedServerRecordMock.mockResolvedValue({
			id: "server_1",
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
		});
		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "ssh-key",
			credential: "mock-credential",
		});
	});

	describe("savePersonaSettings", () => {
		it("returns 401 when unauthenticated", async () => {
			getAuthSession.mockResolvedValue(null);

			const { savePersonaSettings } = await import("./settings");
			const response = await savePersonaSettings(
				createContext({ agentPersona: "helpful assistant" }),
			);

			expect(response.status).toBe(401);
		});

		it("returns 400 for invalid JSON", async () => {
			const { savePersonaSettings } = await import("./settings");
			const response = await savePersonaSettings(
				createInvalidJsonContext() as never,
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "Invalid JSON body",
			});
		});

		it("returns 400 when the JSON body is null", async () => {
			const { savePersonaSettings } = await import("./settings");
			const response = await savePersonaSettings(createContext(null));

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "Persona content is required.",
			});
		});

		it("returns 400 for empty content", async () => {
			const { savePersonaSettings } = await import("./settings");
			const response = await savePersonaSettings(
				createContext({ agentPersona: "   " }),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "Persona content cannot be empty.",
			});
		});

		it("returns 400 for content over 20,000 characters", async () => {
			const { savePersonaSettings } = await import("./settings");
			const response = await savePersonaSettings(
				createContext({ agentPersona: "a".repeat(20_001) }),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "Persona content cannot exceed 20000 characters.",
			});
		});

		it("upserts one active settings row per user", async () => {
			const updatedAt = new Date("2026-06-06T12:00:00.000Z");
			selectLimit.mockResolvedValueOnce([
				{
					agentPersona: "helpful assistant",
					deployedServerId: null,
					deployedServerHost: null,
					deployedAt: null,
					updatedAt,
				},
			]);

			const { savePersonaSettings } = await import("./settings");
			const response = await savePersonaSettings(
				createContext({ agentPersona: "helpful assistant" }),
			);

			expect(response.status).toBe(200);
			expect(onConflictDoUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					target: hermesSettings.userId,
				}),
			);
			expect(insertAuditValues).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "user_123",
					action: "persona.saved",
				}),
			);
			expect(await response.json()).toMatchObject({
				settings: {
					agentPersona: "helpful assistant",
					deployedServerHost: null,
					deployedAt: null,
					updatedAt: updatedAt.toISOString(),
				},
			});
		});
	});

	describe("deployPersonaToHermes", () => {
		const personaRecord = {
			agentPersona: "You are Hermes.",
			deployedServerId: null,
			deployedServerHost: null,
			deployedAt: null,
			updatedAt: new Date("2026-06-06T12:00:00.000Z"),
		};

		const telegramRecord = {
			botToken: "encrypted-bot-token",
			apiServerKey: "encrypted-api-server-key",
			deployedServerId: "server_1",
			deployedServerHost: "1.2.3.4",
		};

		it("returns 401 when unauthenticated", async () => {
			getAuthSession.mockResolvedValue(null);

			const { deployPersonaToHermes } = await import("./settings");
			const response = await deployPersonaToHermes(createContext({}));

			expect(response.status).toBe(401);
		});

		it("returns 400 when no saved persona exists", async () => {
			const { deployPersonaToHermes } = await import("./settings");
			const response = await deployPersonaToHermes(createContext({}));

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "No persona saved. Save a persona first.",
			});
		});

		it("returns 400 when no Telegram deployment target exists", async () => {
			selectLimit
				.mockResolvedValueOnce([personaRecord])
				.mockResolvedValueOnce([]);

			const { deployPersonaToHermes } = await import("./settings");
			const response = await deployPersonaToHermes(createContext({}));

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error:
					"No Hermes deployment found. Deploy a Telegram bot to a server first.",
			});
		});

		it("returns 400 when Telegram deploy info is missing deployedServerId", async () => {
			selectLimit.mockResolvedValueOnce([personaRecord]).mockResolvedValueOnce([
				{
					botToken: "encrypted-bot-token",
					apiServerKey: "encrypted-api-server-key",
					deployedServerId: null,
					deployedServerHost: null,
				},
			]);

			const { deployPersonaToHermes } = await import("./settings");
			const response = await deployPersonaToHermes(createContext({}));

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error:
					"No Hermes deployment found. Deploy a Telegram bot to a server first.",
			});
			expect(withSshConnection).not.toHaveBeenCalled();
		});

		it("writes SOUL.md, restarts Hermes, and records deploy metadata", async () => {
			selectLimit
				.mockResolvedValueOnce([personaRecord])
				.mockResolvedValueOnce([telegramRecord]);

			const { deployPersonaToHermes } = await import("./settings");
			const response = await deployPersonaToHermes(createContext({}));

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				status: "deployed",
				serverHost: "1.2.3.4",
			});
			expect(withSshConnection).toHaveBeenCalled();
			expect(writeSoulMd).toHaveBeenCalledWith(
				expect.anything(),
				"You are Hermes.",
			);
			expect(restartGateway).toHaveBeenCalled();
			expect(onConflictDoUpdate).toHaveBeenCalled();
			expect(insertAuditValues).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "user_123",
					action: "persona.deployed",
					serverId: "server_1",
				}),
			);
		});

		it("logs failure cleanly when SSH deploy fails", async () => {
			writeSoulMd.mockRejectedValueOnce(new Error("Write failed"));
			selectLimit
				.mockResolvedValueOnce([personaRecord])
				.mockResolvedValueOnce([telegramRecord]);

			const { deployPersonaToHermes } = await import("./settings");
			const response = await deployPersonaToHermes(createContext({}));

			expect(response.status).toBe(502);
			expect(await response.json()).toMatchObject({
				error: "Deploy failed: Write failed",
			});
			expect(insertAuditValues).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "user_123",
					action: "persona.deploy.failed",
					serverId: "server_1",
				}),
			);
			expect(onConflictDoUpdate).not.toHaveBeenCalled();
		});
	});
});

function createContext(body: unknown) {
	return {
		req: {
			raw: new Request("http://localhost/api/settings/persona", {
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

function createInvalidJsonContext() {
	return {
		req: {
			raw: new Request("http://localhost/api/settings/persona", {
				method: "POST",
				body: "{",
				headers: { "content-type": "application/json" },
			}),
			json: () => Promise.reject(new Error("Invalid JSON")),
			header: () => null,
		},
		json: (payload: unknown, status = 200) =>
			new Response(JSON.stringify(payload), {
				status,
				headers: { "content-type": "application/json" },
			}),
	};
}
