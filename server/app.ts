import { Hono } from "hono";
import { getAuth, hasDatabaseUrl } from "./auth";
import { getDashboardStatus } from "./dashboard";
import { checkDatabaseConnection } from "./db/health";
import { startServerInstall, streamServerInstallEvents } from "./install";
import { saveProviderConfig, testProviderConfig } from "./providers";
import { connectServer } from "./servers";
import { connectTelegram, disconnectTelegram } from "./telegram";

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

apiApp.post("/auth/send-magic-link", (context) => {
	if (!hasDatabaseUrl()) {
		return handleAuthUnavailable(context);
	}

	return getAuth().handler(
		rewriteAuthRequest(context.req.raw, "/api/auth/sign-in/magic-link"),
	);
});

apiApp.get("/auth/verify-magic-link", (context) => {
	if (!hasDatabaseUrl()) {
		return handleAuthUnavailable(context);
	}

	return getAuth().handler(
		rewriteAuthRequest(context.req.raw, "/api/auth/magic-link/verify"),
	);
});

apiApp.get("/auth/callback", (context) => {
	if (!hasDatabaseUrl()) {
		return handleAuthUnavailable(context);
	}

	return getAuth().handler(
		rewriteAuthRequest(context.req.raw, "/api/auth/magic-link/verify"),
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

apiApp.post("/servers/connect", connectServer);
apiApp.post("/servers/:id/install", startServerInstall);
apiApp.get("/servers/:id/install/events", streamServerInstallEvents);
apiApp.get("/dashboard/status", getDashboardStatus);
apiApp.post("/providers", saveProviderConfig);
apiApp.post("/providers/test", testProviderConfig);
apiApp.post("/telegram/connect", connectTelegram);
apiApp.post("/telegram/disconnect", disconnectTelegram);
