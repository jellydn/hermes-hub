import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createContext } from "./test-helpers";

const {
	getAuthSession,
	getOwnedServerRecord,
	getResolvedServerWebUiRecord,
	proxyRequestOverSsh,
	resolveServerSshConfigOrError,
} = vi.hoisted(() => ({
	getAuthSession: vi.fn(),
	getOwnedServerRecord: vi.fn(),
	getResolvedServerWebUiRecord: vi.fn(),
	proxyRequestOverSsh: vi.fn(),
	resolveServerSshConfigOrError: vi.fn(),
}));

vi.mock("../../auth", () => ({
	getAuthSession,
}));

vi.mock("../../crypto", () => ({}));

vi.mock("../../server-records", () => ({
	getOwnedServerRecord,
	resolveServerSshConfigOrError,
}));

vi.mock(
	"../records",
	async (importOriginal: () => Promise<typeof import("../records")>) => {
		const actual = await importOriginal();
		return {
			...actual,
			getResolvedServerWebUiRecord,
		};
	},
);

vi.mock(
	"../proxy",
	async (importOriginal: () => Promise<typeof import("../proxy")>) => {
		const actual = await importOriginal();
		return {
			...actual,
			proxyRequestOverSsh,
		};
	},
);

vi.mock("../../lib/get-client-ip", () => ({
	getClientIp: () => "127.0.0.1",
}));

vi.mock("../../db", () => ({
	getDb: () => ({}),
}));

import { proxyServerWebUi } from "../handlers";

describe("web-ui proxy", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "ssh-secret",
		});
		getOwnedServerRecord.mockResolvedValue({
			id: "server_123",
			host: "203.0.113.10",
			port: 22,
			username: "root",
			hostKeyFingerprint: null,
		});
	});

	it.each([
		["without trailing slash", "/api/servers/server_123/web-ui/proxy"],
		["with trailing slash", "/api/servers/server_123/web-ui/proxy/"],
	])("forwards proxy root %s to upstream /", async (_label, proxyRootPath) => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:generated-password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});
		proxyRequestOverSsh.mockResolvedValue(
			new Response("<html>ok</html>", {
				status: 200,
				headers: { "content-type": "text/html" },
			}),
		);

		const response = await proxyServerWebUi(
			createContext({
				url: `http://localhost:3000${proxyRootPath}`,
			}),
		);

		expect(response.status).toBe(200);
		expect(proxyRequestOverSsh).toHaveBeenCalledWith(
			expect.objectContaining({
				upstreamPath: "/",
			}),
		);
	});

	it("reads the request URL from req.raw, not req.url", async () => {
		// Regression: production crashed when context.req.url was undefined by
		// passing it straight into resolveProxyRequestTarget. The fix reads
		// from context.req.raw.url instead. This test directly builds a
		// context missing the .url property to simulate the production shape
		// (HonoRequest that doesn't expose .url).
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:generated-password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});
		proxyRequestOverSsh.mockResolvedValue(new Response("ok", { status: 200 }));

		const context = {
			req: {
				raw: new Request(
					"http://localhost:3000/api/servers/server_123/web-ui/proxy/",
				),
				// No `.url` — simulates HonoRequest that doesn't expose it.
				param: (n: string) => (n === "id" ? "server_123" : undefined),
				header: vi.fn().mockReturnValue(null),
			},
			json: (b: unknown, s = 200) =>
				Response.json(b, { status: s }) as Response,
		} as unknown as Context;

		const response = await proxyServerWebUi(context);

		expect(response.status).toBe(200);
		expect(proxyRequestOverSsh).toHaveBeenCalledWith(
			expect.objectContaining({ upstreamPath: "/" }),
		);
	});

	it("returns 502 instead of crashing when the request path is outside the proxy base", async () => {
		// Regression: resolution used to be outside the try/catch, so an
		// unparseable path raised an uncaught TypeError → 500. Moving it
		// inside the try/catch turns that into a 502 with a usable body.
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:generated-password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});
		// Explicit setup so this test does not depend on the mock
		// implementation from sibling tests persisting across beforeEach.
		proxyRequestOverSsh.mockResolvedValue(new Response("ok", { status: 200 }));

		const context = {
			req: {
				raw: new Request("http://localhost:3000/some-other-path/"),
				param: (n: string) => (n === "id" ? "server_123" : undefined),
				header: vi.fn().mockReturnValue(null),
			},
			json: (b: unknown, s = 200) =>
				Response.json(b, { status: s }) as Response,
		} as unknown as Context;

		const response = await proxyServerWebUi(context);
		const payload = (await response.json()) as { error?: string };

		expect(response.status).toBe(502);
		expect(payload.error).toContain(
			"Request path is not nested under proxy base",
		);
	});

	it("returns actionable errors when the upstream port is closed", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:generated-password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});
		proxyRequestOverSsh.mockRejectedValue(
			new Error("(SSH) Channel open failure: Connection refused"),
		);

		const response = await proxyServerWebUi(
			createContext({
				url: "http://localhost:3000/api/servers/server_123/web-ui/proxy/login",
			}),
		);
		const payload = await response.json();

		expect(response.status).toBe(502);
		expect(payload.error).toContain(
			"Hermes Web UI is not reachable on the server (127.0.0.1:8787)",
		);
	});

	it("rewrites upstream root redirects to the proxy path", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:generated-password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		proxyRequestOverSsh.mockResolvedValue(
			new Response(null, {
				status: 302,
				headers: {
					Location: "/",
				},
			}),
		);

		const response = await proxyServerWebUi(
			createContext({
				url: "http://localhost:3000/api/servers/server_123/web-ui/proxy/login",
			}),
		);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"/api/servers/server_123/web-ui/proxy/",
		);
	});

	it("proxies requests with rewritten response headers", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:generated-password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		proxyRequestOverSsh.mockResolvedValue(
			new Response(null, {
				status: 302,
				headers: {
					Location: "/login",
					"Set-Cookie": "session=abc; Path=/",
				},
			}),
		);

		const response = await proxyServerWebUi(
			createContext({
				url: "http://localhost:3000/api/servers/server_123/web-ui/proxy/",
			}),
		);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"/api/servers/server_123/web-ui/proxy/login",
		);
		expect(response.headers.get("set-cookie")).toBe(
			"session=abc; Path=/api/servers/server_123/web-ui/proxy/",
		);
	});
});
