import { Hono } from "hono";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { getAuth, hasDatabaseUrl } from "./auth";
import { getDashboardStatus } from "./dashboard";
import { checkDatabaseConnection } from "./db/health";
import { startServerInstall, streamServerInstallEvents } from "./install";
import { clearLogs, getLogs } from "./logs";
import { saveProviderConfig, testProviderConfig } from "./providers";
import { getServerDetail, runServerAction } from "./server-actions";
import { connectServer } from "./servers";
import { connectTelegram, disconnectTelegram } from "./telegram";

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
 * Rejects requests made over plain HTTP in production.
 * Relies on x-forwarded-proto set by the reverse proxy (e.g. Caddy, nginx).
 */
function requireHttps(context: {
	req: { raw: Request };
	json: (obj: unknown, status?: number) => Response;
}) {
	if (process.env.NODE_ENV !== "production") {
		return;
	}

	const forwardedProto = context.req.raw.headers.get("x-forwarded-proto");
	if (forwardedProto === "http") {
		return context.json(
			{
				error:
					"HTTPS required. Use a secure connection to access this endpoint.",
			},
			426,
		);
	}
}

apiApp.post("/auth/send-magic-link", async (context) => {
	if (!hasDatabaseUrl()) {
		return handleAuthUnavailable(context);
	}

	const body = await context.req.json().catch(() => null);
	const email = body?.email;

	if (email) {
		try {
			await magicLinkRateLimiter.consume(email);
		} catch {
			return context.json(
				{
					error:
						"Too many requests. Please wait 5 minutes before requesting another magic link.",
				},
				429,
			);
		}
	}

	return getAuth().handler(
		rewriteAuthRequest(context.req.raw, "/api/auth/sign-in/magic-link"),
	);
});

apiApp.on(["GET", "POST"], "/auth/*", (context) => {
	if (!hasDatabaseUrl()) {
		return handleAuthUnavailable(context);
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

apiApp.post("/servers/connect", (c) => {
	const httpsResult = requireHttps(c);
	if (httpsResult) {
		return httpsResult;
	}
	return connectServer(c);
});
apiApp.get("/servers/:id", getServerDetail);
apiApp.post("/servers/:id/install", (c) => {
	const httpsResult = requireHttps(c);
	if (httpsResult) {
		return httpsResult;
	}
	return startServerInstall(c);
});
apiApp.get("/servers/:id/install/events", streamServerInstallEvents);
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
apiApp.post("/providers", saveProviderConfig);
apiApp.post("/providers/test", testProviderConfig);
apiApp.post("/telegram/connect", connectTelegram);
apiApp.post("/telegram/disconnect", disconnectTelegram);
