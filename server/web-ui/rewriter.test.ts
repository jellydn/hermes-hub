import { describe, expect, it } from "vitest";

import {
	buildUpstreamProxyHeaders,
	getPublicRequestEndpoint,
	getUpstreamPath,
	resolveProxyRequestTarget,
	rewriteLocationHeader,
	rewriteSetCookieHeader,
} from "./rewriter";

const proxyBasePath = "/api/servers/server_123/web-ui/proxy/";

describe("web-ui proxy helpers", () => {
	it.each([
		["without trailing slash", "/api/servers/server_123/web-ui/proxy"],
		["with trailing slash", "/api/servers/server_123/web-ui/proxy/"],
	])("forwards proxy root %s to upstream /", (_label, proxyRootPath) => {
		expect(
			resolveProxyRequestTarget(
				`http://localhost:3000${proxyRootPath}`,
				proxyBasePath,
			),
		).toBe("/");
	});

	it("forwards nested proxy paths to the upstream web UI", () => {
		expect(
			resolveProxyRequestTarget(
				"http://localhost:3000/api/servers/server_123/web-ui/proxy/login",
				proxyBasePath,
			),
		).toBe("/login");
	});

	it("maps nested paths under the proxy base to upstream paths", () => {
		expect(
			getUpstreamPath(
				"http://localhost:3000/api/servers/server_123/web-ui/proxy/login",
				proxyBasePath,
			),
		).toBe("/login");
	});

	it("rewrites Location headers to the proxy path", () => {
		expect(
			rewriteLocationHeader("/login", proxyBasePath, "http://127.0.0.1:8787"),
		).toBe("/api/servers/server_123/web-ui/proxy/login");
	});

	it("rewrites upstream root redirects to the proxy path", () => {
		expect(
			rewriteLocationHeader("/", proxyBasePath, "http://127.0.0.1:8787"),
		).toBe(proxyBasePath);
	});

	it("rewrites relative login redirects and proxied next targets", () => {
		expect(
			rewriteLocationHeader(
				"login?next=/",
				proxyBasePath,
				"http://127.0.0.1:8787",
			),
		).toBe(
			"/api/servers/server_123/web-ui/proxy/login?next=%2Fapi%2Fservers%2Fserver_123%2Fweb-ui%2Fproxy%2F",
		);
	});

	it("rewrites session redirects with proxied next targets", () => {
		expect(
			rewriteLocationHeader(
				"/login?next=/session/abc123",
				proxyBasePath,
				"http://127.0.0.1:8787",
			),
		).toBe(
			"/api/servers/server_123/web-ui/proxy/login?next=%2Fapi%2Fservers%2Fserver_123%2Fweb-ui%2Fproxy%2Fsession%2Fabc123",
		);
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
				"https://hermes-hub.itman.fyi/api/servers/server_123/web-ui/proxy/",
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
		expect(headers.origin).toBe("https://hermes-hub.itman.fyi");
	});

	it("prefers reverse-proxy forwarded headers when the app URL is internal", () => {
		const endpoint = getPublicRequestEndpoint(
			new Request(
				"http://172.17.0.2:5000/api/servers/server_123/web-ui/proxy/",
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
				"http://172.17.0.2:5000/api/servers/server_123/web-ui/proxy/",
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
