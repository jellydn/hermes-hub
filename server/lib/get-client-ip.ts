import type { Context } from "hono";

/**
 * Extract the client IP address from a Hono request context.
 *
 * `X-Forwarded-For` is appended to left-to-right by each proxy in the
 * chain, so the *leftmost* entry is the original client and each entry
 * to its right is a proxy hop. We trust the rightmost `TRUSTED_PROXY_COUNT`
 * entries (added by our own infrastructure) and treat the entry just to
 * the left of them as the client. Anything further left can be forged by
 * an upstream untrusted proxy, so we never look past that boundary.
 *
 * When `x-forwarded-for` is missing falls back to `x-real-ip`.
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
	const ips: string[] = [];
	for (const part of forwarded.split(",")) {
		const ip = part.trim();
		if (ip) {
			ips.push(ip);
		}
	}

	if (ips.length === 0) {
		return null;
	}

	// Skip the `proxyCount` rightmost entries (trusted proxy hops). The
	// next entry to the left is the client. If the chain is shorter than
	// expected, fall back to the leftmost (client-most) entry.
	const clientIndex = Math.max(0, ips.length - 1 - proxyCount);
	return ips[clientIndex] ?? null;
}
