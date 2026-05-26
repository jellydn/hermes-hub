import { Hono } from "hono";
import { auth } from "./auth";
import { checkDatabaseConnection } from "./db/health";

export const apiApp = new Hono().basePath("/api");

function rewriteAuthRequest(request: Request, pathname: string) {
	const url = new URL(request.url);
	url.pathname = pathname;

	return new Request(url.toString(), request);
}

apiApp.post("/auth/send-magic-link", (context) => {
	return auth.handler(
		rewriteAuthRequest(context.req.raw, "/api/auth/sign-in/magic-link"),
	);
});

apiApp.get("/auth/verify-magic-link", (context) => {
	return auth.handler(
		rewriteAuthRequest(context.req.raw, "/api/auth/magic-link/verify"),
	);
});

apiApp.on(["GET", "POST"], "/auth/*", (context) => {
	return auth.handler(context.req.raw);
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
