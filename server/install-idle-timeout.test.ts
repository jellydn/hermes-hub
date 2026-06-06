import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	IDLE_TIMEOUT_MS,
	installStreams,
	resetInstallStream,
} from "./install/sse-stream";

const {
	getAuthSession,
	selectFrom,
	selectWhere,
	selectLimit,
	dbSelect,
	streamSSE,
	writeSSE,
	close,
	onAbort,
} = vi.hoisted(() => ({
	getAuthSession: vi.fn(),
	selectFrom: vi.fn(),
	selectWhere: vi.fn(),
	selectLimit: vi.fn(),
	dbSelect: vi.fn(),
	streamSSE: vi.fn(),
	writeSSE: vi.fn(),
	close: vi.fn(),
	onAbort: vi.fn(),
}));

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./db", () => ({
	getDb: () => ({
		select: dbSelect,
	}),
}));

vi.mock("hono/streaming", () => ({
	streamSSE,
}));

import { streamServerInstallEvents } from "./install";

describe("streamServerInstallEvents idle timeout", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		installStreams.clear();

		getAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123" },
		});

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({ limit: selectLimit });
		selectLimit.mockResolvedValue([
			{
				id: "server_123",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "password",
				encryptedCredential: "encrypted-secret",
				storeCredential: true,
			},
		]);

		writeSSE.mockImplementation(async (payload: { data?: string }) => {
			if (payload.data === ": heartbeat") {
				return new Promise(() => undefined);
			}

			return undefined;
		});

		streamSSE.mockImplementation(async (_context, handler) => {
			await handler({
				writeSSE,
				close,
				onAbort,
			});

			return new Response(null, {
				status: 200,
				headers: { "content-type": "text/event-stream" },
			});
		});
	});

	it("closes the SSE stream after the idle timeout when heartbeat writes never complete", async () => {
		const state = resetInstallStream("server_123", "install_123");
		state.status = "running";

		const responsePromise = streamServerInstallEvents(createContext());

		await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
		const response = await responsePromise;

		expect(response.status).toBe(200);
		expect(close).toHaveBeenCalledTimes(1);
		expect(state.listeners.size).toBe(0);
	});
});

function createContext() {
	const headers = new Headers();

	return {
		req: {
			raw: new Request(
				"http://localhost/api/servers/server_123/install/events",
			),
			param: (name: string) => (name === "id" ? "server_123" : undefined),
		},
		header: (name: string, value: string) => {
			headers.set(name, value);
		},
		newResponse: (body: BodyInit | null) =>
			new Response(body, {
				status: 200,
				headers,
			}),
		json: (payload: unknown, status = 200) =>
			new Response(JSON.stringify(payload), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as never;
}
