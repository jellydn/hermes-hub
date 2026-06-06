import { describe, expect, it } from "vitest";

import {
	buildUpstreamProxyHeaders,
	getPublicRequestEndpoint,
	getUpstreamPath,
	rewriteLocationHeader,
	rewriteSetCookieHeader,
} from "./proxy-http";

describe("web-ui proxy helpers", () => {
	it("maps the proxy root to the upstream root", () => {
		expect(
			getUpstreamPath(
				"http://localhost:3000/api/servers/server_123/web-ui/proxy/",
				"/api/servers/server_123/web-ui/proxy/",
			),
		).toBe("/");
	});

	it("forwards nested paths under the proxy base", () => {
		expect(
			getUpstreamPath(
				"http://localhost:3000/api/servers/server_123/web-ui/proxy/chat",
				"/api/servers/server_123/web-ui/proxy/",
			),
		).toBe("/chat");
	});

	it("rewrites Location headers to the proxy path", () => {
		expect(
			rewriteLocationHeader(
				"/login",
				"/api/servers/server_123/web-ui/proxy/",
				"http://127.0.0.1:8787",
			),
		).toBe("/api/servers/server_123/web-ui/proxy/login");
	});

	it("rewrites upstream origin redirects to the proxy path", () => {
		expect(
			rewriteLocationHeader(
				"http://127.0.0.1:8787/dashboard",
				"/api/servers/server_123/web-ui/proxy/",
				"http://127.0.0.1:8787",
			),
		).toBe("/api/servers/server_123/web-ui/proxy/dashboard");
	});

	it("forwards public host and proto headers to the upstream web UI", () => {
		const headers = buildUpstreamProxyHeaders(
			new Request(
				"https://hermes-hub.itman.fyi/api/servers/server_123/web-ui/proxy/chat",
				{
					headers: {
						Origin: "https://hermes-hub.itman.fyi",
						"X-Forwarded-For": "203.0.113.10",
					},
				},
			),
			"127.0.0.1:8787",
		);

		expect(headers.host).toBe("127.0.0.1:8787");
		expect(headers["X-Forwarded-Host"]).toBe("hermes-hub.itman.fyi");
		expect(headers["X-Forwarded-Proto"]).toBe("https");
		expect(headers["X-Forwarded-For"]).toBe("203.0.113.10");
	});

	it("prefers reverse-proxy forwarded headers when the app URL is internal", () => {
		const endpoint = getPublicRequestEndpoint(
			new Request(
				"http://172.17.0.2:5000/api/servers/server_123/web-ui/proxy/chat",
				{
					headers: {
						host: "hermes-hub.itman.fyi",
						"x-forwarded-host": "hermes-hub.itman.fyi",
						"x-forwarded-proto": "https",
					},
				},
			),
		);
		const headers = buildUpstreamProxyHeaders(
			new Request(
				"http://172.17.0.2:5000/api/servers/server_123/web-ui/proxy/chat",
				{
					headers: {
						host: "hermes-hub.itman.fyi",
						"x-forwarded-host": "hermes-hub.itman.fyi",
						"x-forwarded-proto": "https",
					},
				},
			),
			"127.0.0.1:8787",
		);

		expect(endpoint).toEqual({
			host: "hermes-hub.itman.fyi",
			proto: "https",
		});
		expect(headers["X-Forwarded-Host"]).toBe("hermes-hub.itman.fyi");
		expect(headers["X-Forwarded-Proto"]).toBe("https");
	});

	it("rewrites cookie paths for the proxy base", () => {
		expect(
			rewriteSetCookieHeader(
				"session=abc; Path=/; HttpOnly",
				"/api/servers/server_123/web-ui/proxy/",
			),
		).toBe("session=abc; Path=/api/servers/server_123/web-ui/proxy/; HttpOnly");
	});
});
