import { Hono } from "hono";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { getAuth, hasDatabaseUrl } from "./auth";
import { getDashboardStatus } from "./dashboard";
import { checkDatabaseConnection } from "./db/health";
import {
	getLatestServerInstallLog,
	startServerInstall,
	streamServerInstallEvents,
} from "./install";
import { clearLogs, getLogs } from "./logs";
import { saveProviderConfig, testProviderConfig } from "./providers";
import { getServerDetail, runServerAction } from "./server-actions";
import {
	connectServer,
	deleteServer,
	listServers,
	updateServer,
} from "./servers";
import {
	connectTelegram,
	deployTelegramToServer,
	disconnectTelegram,
	testTelegramBot,
} from "./telegram";

// 3 requests per 5 minutes per email for magic link sending
const magicLinkRateLimiter = new RateLimiterMemory({
	points: 3,
	duration: 5 * 60, // 5 minutes in seconds
	blockDuration: 5 * 60, // block for 5 minutes after reaching limit
});

export const apiApp = new Hono().basePath("/api");

function rewriteAuthRequest(request: Request, pathname: string) {
	const url = new URL(request.url);
	url.pathname = pathname;

	return new Request(url.toString(), request);
}

function handleAuthUnavailable(context: {
	json: (obj: unknown, status?: number) => Response;
}) {
	return context.json({ error: "DATABASE_URL is required" }, 503);
}

/**
 * Rejects requests made over plain HTTP in production. In production we
 * require a positive `https` signal — either the request URL is already
 * `https://`, or the reverse proxy (Caddy/nginx/etc.) forwards
 * `x-forwarded-proto: https`. Requests where the protocol is unknown are
 * rejected so a missing or misconfigured proxy header cannot silently let
 * credential bodies travel over plaintext.
 *
 * Deployment assumption: HermesHub is intended to run behind a single
 * TLS-terminating reverse proxy that owns the public hostname (Caddy,
 * nginx, etc.) and overwrites `x-forwarded-proto` rather than passing
 * through client headers. The app process must NOT be exposed to the
 * public Internet directly. If you do not control the upstream proxy
 * (e.g. running with a pass-through CDN), the `x-forwarded-proto` header
 * can be spoofed and this guard alone will not prevent plaintext leaks.
 */
function requireHttps(context: {
	req: { raw: Request };
	json: (obj: unknown, status?: number) => Response;
}) {
	/**
	 * NOTE: Uses globalThis.process to avoid Vite's build-time replacement
	 * of `process.env.NODE_ENV`. The Dockerfile bakes ENV NODE_ENV=production,
	 * which causes the compiler to inline the literal and tree-shake this
	 * dev-only early return away.
	 */
	const nodeEnv =
		typeof globalThis !== "undefined" && globalThis.process?.env?.NODE_ENV;
	if (nodeEnv !== "production") {
		return;
	}

	const forwardedProto = context.req.raw.headers
		.get("x-forwarded-proto")
		?.split(",")[0]
		?.trim()
		.toLowerCase();
	const urlProtocol = new URL(context.req.raw.url).protocol;

	const isHttps = forwardedProto === "https" || urlProtocol === "https:";
	if (!isHttps) {
		return context.json(
			{
				error:
					"HTTPS required. Use a secure connection to access this endpoint.",
			},
			426,
		);
	}
}

async function applyMagicLinkRateLimit(request: Request) {
	let email: unknown = null;
	try {
		const cloned = request.clone();
		const body = (await cloned.json().catch(() => null)) as {
			email?: unknown;
		} | null;
		email = body?.email;
	} catch {
		email = null;
	}

	if (typeof email !== "string" || email.length === 0) {
		return null;
	}

	try {
		await magicLinkRateLimiter.consume(email);
		return null;
	} catch {
		return Response.json(
			{
				error:
					"Too many requests. Please wait 5 minutes before requesting another magic link.",
			},
			{ status: 429 },
		);
	}
}

apiApp.post("/auth/send-magic-link", async (context) => {
	if (!hasDatabaseUrl()) {
		return handleAuthUnavailable(context);
	}

	const limited = await applyMagicLinkRateLimit(context.req.raw);
	if (limited) {
		return limited;
	}

	return getAuth().handler(
		rewriteAuthRequest(context.req.raw, "/api/auth/sign-in/magic-link"),
	);
});

apiApp.on(["GET", "POST"], "/auth/*", async (context) => {
	if (!hasDatabaseUrl()) {
		return handleAuthUnavailable(context);
	}

	const url = new URL(context.req.raw.url);
	if (
		context.req.raw.method === "POST" &&
		url.pathname === "/api/auth/sign-in/magic-link"
	) {
		const limited = await applyMagicLinkRateLimit(context.req.raw);
		if (limited) {
			return limited;
		}
	}

	return getAuth().handler(context.req.raw);
});

apiApp.get("/health", async (context) => {
	const timestamp = new Date().toISOString();

	try {
		await checkDatabaseConnection();

		return context.json({
			status: "ok",
			database: "connected",
			timestamp,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown database error";

		return context.json({
			status: "degraded",
			database: "disconnected",
			error: message,
			timestamp,
		});
	}
});

apiApp.get("/servers", listServers);
apiApp.post("/servers/connect", (c) => {
	const httpsResult = requireHttps(c);
	if (httpsResult) {
		return httpsResult;
	}
	return connectServer(c);
});
apiApp.get("/servers/:id", getServerDetail);
apiApp.patch("/servers/:id", (c) => {
	const httpsResult = requireHttps(c);
	if (httpsResult) {
		return httpsResult;
	}
	return updateServer(c);
});
apiApp.delete("/servers/:id", (c) => {
	const httpsResult = requireHttps(c);
	if (httpsResult) {
		return httpsResult;
	}
	return deleteServer(c);
});
apiApp.post("/servers/:id/install", (c) => {
	const httpsResult = requireHttps(c);
	if (httpsResult) {
		return httpsResult;
	}
	return startServerInstall(c);
});
apiApp.get("/servers/:id/install/events", streamServerInstallEvents);
apiApp.get("/servers/:id/install/log", getLatestServerInstallLog);
apiApp.post("/servers/:id/actions", (c) => {
	const httpsResult = requireHttps(c);
	if (httpsResult) {
		return httpsResult;
	}
	return runServerAction(c);
});
apiApp.get("/dashboard/status", getDashboardStatus);
apiApp.get("/logs", getLogs);
apiApp.post("/logs/clear", clearLogs);
apiApp.post("/providers", (c) => {
	const httpsResult = requireHttps(c);
	if (httpsResult) {
		return httpsResult;
	}
	return saveProviderConfig(c);
});
apiApp.post("/providers/test", (c) => {
	const httpsResult = requireHttps(c);
	if (httpsResult) {
		return httpsResult;
	}
	return testProviderConfig(c);
});
apiApp.post("/telegram/connect", (c) => {
	const httpsResult = requireHttps(c);
	if (httpsResult) {
		return httpsResult;
	}
	return connectTelegram(c);
});
apiApp.post("/telegram/disconnect", disconnectTelegram);
apiApp.post("/telegram/deploy", (c) => {
	const httpsResult = requireHttps(c);
	if (httpsResult) {
		return httpsResult;
	}
	return deployTelegramToServer(c);
});
apiApp.post("/telegram/test", (c) => {
	const httpsResult = requireHttps(c);
	if (httpsResult) {
		return httpsResult;
	}
	return testTelegramBot(c);
});
