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
const resolveHermesDeployContext = vi.fn();

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

vi.mock("./hermes/persona", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./hermes/persona")>();
	return {
		...actual,
		writeSoulMd,
	};
});

vi.mock("./hermes/runtime", () => ({
	restartGateway,
}));

vi.mock("./hermes/deploy-context", () => ({
	resolveHermesDeployContext,
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

		resolveHermesDeployContext.mockResolvedValue({
			sshCtx: {
				session: { session: { id: "session_123" }, user: { id: "user_123" } },
				server: {
					id: "server_1",
					host: "1.2.3.4",
					port: 22,
					username: "root",
					hostKeyFingerprint: null,
				},
				serverId: "server_1",
				authMethod: "ssh-key",
				credential: "mock-credential",
			},
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
					updatedAt: expect.any(String),
				},
			});
		});
	});

	describe("deployPersonaToHermes", () => {
		const personaRecord = {
			agentPersona: "You are Hermes.",
			updatedAt: new Date("2026-06-06T12:00:00.000Z"),
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

		it("returns 400 when no deployed Hermes agent exists", async () => {
			selectLimit.mockResolvedValueOnce([personaRecord]);
			resolveHermesDeployContext.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						error:
							"No deployed Hermes agent found. Install Hermes on a server first.",
					}),
					{ status: 400 },
				),
			);

			const { deployPersonaToHermes } = await import("./settings");
			const response = await deployPersonaToHermes(createContext({}));

			expect(response.status).toBe(400);
			expect(withSshConnection).not.toHaveBeenCalled();
		});

		it("passes the selected serverId to the deploy resolver", async () => {
			selectLimit.mockResolvedValueOnce([personaRecord]);

			const { deployPersonaToHermes } = await import("./settings");
			const response = await deployPersonaToHermes(
				createContext({ serverId: "server_2" }),
			);

			expect(response.status).toBe(200);
			expect(resolveHermesDeployContext).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					user: expect.objectContaining({ id: "user_123" }),
				}),
				"server_2",
			);
		});

		it("writes SOUL.md, restarts Hermes, and records deploy audit", async () => {
			selectLimit.mockResolvedValueOnce([personaRecord]);

			const { deployPersonaToHermes } = await import("./settings");
			const response = await deployPersonaToHermes(createContext({}));

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				status: "deployed",
				serverId: "server_1",
				serverHost: "1.2.3.4",
				deployedAt: expect.any(String),
			});
			expect(withSshConnection).toHaveBeenCalled();
			expect(writeSoulMd).toHaveBeenCalledWith(
				expect.anything(),
				"You are Hermes.",
			);
			expect(restartGateway).toHaveBeenCalled();
			expect(insertAuditValues).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "user_123",
					action: "persona.deployed",
					serverId: "server_1",
				}),
			);
			expect(onConflictDoUpdate).not.toHaveBeenCalled();
		});

		it("logs failure cleanly when SSH deploy fails", async () => {
			writeSoulMd.mockRejectedValueOnce(new Error("Write failed"));
			selectLimit.mockResolvedValueOnce([personaRecord]);

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
