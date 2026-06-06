import { describe, expect, it } from "vitest";

import {
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

	it("rewrites cookie paths for the proxy base", () => {
		expect(
			rewriteSetCookieHeader(
				"session=abc; Path=/; HttpOnly",
				"/api/servers/server_123/web-ui/proxy/",
			),
		).toBe("session=abc; Path=/api/servers/server_123/web-ui/proxy/; HttpOnly");
	});
});
