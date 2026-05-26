import type { Context } from "hono";

/**
 * Extract the client IP address from a Hono request context.
 *
 * Reads the rightmost IP from `x-forwarded-for` when behind one or more
 * trusted reverse proxies.  The number of trusted proxies is configured
 * via the `TRUSTED_PROXY_COUNT` env var (default 1).
 *
 * When `x-forwarded-for` is missing or the request is not behind a proxy,
 * falls back to `context.req.header("x-forwarded-for") ?? context.req.raw`
 * remote address (already populated by Hono from the TCP socket or a
 * platform-provided header like `x-real-ip`).
 */
export function getClientIp(context: Context): string | null {
	const forwarded = context.req.header("x-forwarded-for");
	if (!forwarded) {
		return (
			context.req.header("x-real-ip") ??
			context.req.raw.headers.get("x-real-ip") ??
			null
		);
	}

	const proxyCount = Number.parseInt(
		process.env.TRUSTED_PROXY_COUNT ?? "1",
		10,
	);
	const ips = forwarded
		.split(",")
		.map((ip) => ip.trim())
		.filter(Boolean);

	if (ips.length === 0) {
		return null;
	}

	// Rightmost IP is the client when behind proxies
	const clientIndex = Math.max(0, ips.length - proxyCount);
	return ips[clientIndex] ?? ips[ips.length - 1] ?? null;
}
