import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthSession = vi.fn();
const encryptSecret = vi.fn();
const decryptSecret = vi.fn();
const insertValues = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn();
const selectFrom = vi.fn();
const selectWhere = vi.fn();
const selectOrderBy = vi.fn();
const selectLimit = vi.fn();

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./crypto", () => ({
	encryptSecret,
	decryptSecret,
}));

vi.mock("./db", () => ({
	getDb: () => ({
		insert: () => ({ values: insertValues }),
		update: () => ({ set: updateSet }),
		select: () => ({ from: selectFrom }),
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
	auditLogs: {},
}));

describe("telegram handlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		encryptSecret.mockImplementation((value: string) => `enc:${value}`);
		decryptSecret.mockImplementation((value: string) =>
			value.startsWith("enc:") ? value.slice(4) : value,
		);
		updateSet.mockReturnValue({ where: updateWhere });
		updateWhere.mockResolvedValue(undefined);
		insertValues.mockResolvedValue(undefined);
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({ orderBy: selectOrderBy });
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
