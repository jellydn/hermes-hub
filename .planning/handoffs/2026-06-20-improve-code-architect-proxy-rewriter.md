# Session Handoff Plan - Improve Code Architecture of Proxy Rewriter

## 1. Primary Request and Intent

The intent of the session was to:
1. Address the PR #74 review comments regarding the Web-UI Proxy Rewriter.
2. Ensure multiple `Set-Cookie` headers are processed without folding (joining them with commas), and prevent header duplication for `X-Forwarded-*` headers when incoming headers already specify them.
3. Clean up and simplify the path concatenation code (`rewriteUpstreamPathForProxy`) and cookie path parsing (`rewriteCookieSegment`) in `server/web-ui/rewriter.ts` using simplified/optimized code patterns ("code judo moves").

All of these tasks have been successfully implemented, verified with tests, formatted, and pushed to the remote branch `refactor/deepen-http-proxy-rewriter`.

## 2. Key Technical Concepts

- **HTTP Proxy Cookie Mapping**: Rewriting paths in `Set-Cookie` headers so they map correctly to the proxy base path in the client browser.
- **Set-Cookie Folding**: Avoiding `Headers.prototype.entries()` for `Set-Cookie` since it merges separate headers into a single comma-separated string, which browsers fail to parse. Using `Headers.prototype.getSetCookie()` retrieves them as a clean array.
- **Forwarded Headers Duplication**: Standardizing casing and preventing duplicate `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For` keys when forwarding requests to the upstream server.

## 3. Files and Code Sections

### [rewriter.ts](file:///Users/huynhdung/src/tries/2026-05-29-jellydn-hermes-hub/server/web-ui/rewriter.ts)

- **Why important**: Houses the decoupled HTTP request/response header and path rewriting logic.
- **Changes made**:
  - Leveraged `getSetCookie()` inside `rewriteProxyResponseHeaders` to bypass cookie folding.
  - Filtered out pre-existing `x-forwarded-host`, `x-forwarded-proto`, and `x-forwarded-for` inside `filterRequestHeaders`.
  - Simplified cookie segment rewriting to use regex search-and-replace instead of a verbose manual loop.
  - Simplified `rewriteUpstreamPathForProxy` by utilizing `joinProxyPath`'s internal path prefixing.
- **Code snippet**:

```typescript
function rewriteCookieSegment(segment: string, proxyBasePath: string) {
	return segment.replace(/;\s*path\s*=\s*([^;\s]+)/i, (_, pathVal) => {
		const nextPath =
			pathVal === "/" ? proxyBasePath : joinProxyPath(proxyBasePath, pathVal);
		return `; Path=${nextPath}`;
	});
}

function rewriteUpstreamPathForProxy(
	upstreamPath: string,
	proxyBasePath: string,
) {
	return upstreamPath === "" || upstreamPath === "/"
		? proxyBasePath
		: joinProxyPath(proxyBasePath, upstreamPath);
}

function filterRequestHeaders(headers: Headers) {
	const filtered: Record<string, string> = {};
	for (const [name, value] of headers.entries()) {
		const lowerName = name.toLowerCase();
		if (
			!HOP_BY_HOP_REQUEST_HEADERS.has(lowerName) &&
			!FORWARDED_HEADERS.has(lowerName)
		) {
			filtered[name] = value;
		}
	}
	return filtered;
}
```

### [rewriter.test.ts](file:///Users/huynhdung/src/tries/2026-05-29-jellydn-hermes-hub/server/web-ui/rewriter.test.ts)

- **Why important**: Unit tests for rewriter engine.
- **Changes made**: Added unit tests verifying multiple cookie handling without folding, and checking that forwarded headers are not duplicated.
- **Code snippet**:

```typescript
	it("rewrites multiple Set-Cookie headers without folding them", () => {
		const headers = new Headers();
		headers.append("Set-Cookie", "session=abc; Path=/; HttpOnly");
		headers.append("Set-Cookie", "theme=dark; Path=/settings; Secure");

		const rewritten = rewriteProxyResponseHeaders(
			headers,
			"/api/servers/server_123/web-ui/proxy/",
			"http://127.0.0.1:8787",
		);

		const cookies = rewritten.getSetCookie();
		expect(cookies).toHaveLength(2);
		expect(cookies[0]).toBe("session=abc; Path=/api/servers/server_123/web-ui/proxy/; HttpOnly");
		expect(cookies[1]).toBe("theme=dark; Path=/api/servers/server_123/web-ui/proxy/settings; Secure");
	});

	it("filters out pre-existing forwarded headers to prevent casing duplicates", () => {
		const incomingHeaders = new Headers({
			"x-forwarded-host": "old-host.com",
			"x-forwarded-proto": "http",
			"x-forwarded-for": "1.1.1.1",
			"Custom-Header": "value",
		});

		const req = new Request("http://localhost:3000/api/servers/server_123/web-ui/proxy/", {
			headers: incomingHeaders,
		});

		const headers = buildUpstreamProxyHeaders(req, "127.0.0.1:8787");

		// verify target X-Forwarded headers exist with uppercase keys
		expect(headers["X-Forwarded-Host"]).toBe("old-host.com");
		expect(headers["X-Forwarded-Proto"]).toBe("http");
		expect(headers["X-Forwarded-For"]).toBe("1.1.1.1");
		expect(headers["custom-header"]).toBe("value");

		// verify lower-cased versions do not exist as duplicates in key mapping
		expect(headers["x-forwarded-host"]).toBeUndefined();
		expect(headers["x-forwarded-proto"]).toBeUndefined();
		expect(headers["x-forwarded-for"]).toBeUndefined();
	});
```

### [refactor-deepen-http-proxy-rewriter.md](file:///Users/huynhdung/src/tries/2026-05-29-jellydn-hermes-hub/.changeset/refactor-deepen-http-proxy-rewriter.md)

- **Why important**: Changeset file created to satisfy the CI changeset-bot.
- **Changes made**: Added standard patch changeset.

## 4. Problem Solving

- **Set-Cookie Folding**: Directly targeted with `headers.getSetCookie()` which yields individual string entries instead of joining them under standard headers iteration.
- **Duplicate casing headers**: Explicitly added `FORWARDED_HEADERS` block matching `x-forwarded-host`, `x-forwarded-proto`, and `x-forwarded-for` to the exclusion list of headers cloned from the request, preventing casing collisions.

## 5. Pending Tasks

- Track CI workflow validation completion on GitHub Actions for PR #74.
- Monitor CodeRabbit's automated review updates.

## 6. Current Work

All modifications are complete, tests are passing, and changes are successfully committed and pushed to `origin/refactor/deepen-http-proxy-rewriter`. The PR review comment has been resolved.

## 7. Next Step

1. Monitor CI pipeline on GitHub Actions to ensure validate job passes.
2. Request a final merge approval for PR #74 once the tests turn green.
