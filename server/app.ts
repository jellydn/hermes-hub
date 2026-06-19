import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { getAuth, hasDatabaseUrl } from "./auth";
import { getDashboardStatus } from "./dashboard";
import { checkDatabaseConnection } from "./db/health";
import { deployProviderToHermes } from "./deploy";
import { runServerHealthCheck } from "./health-check";
import {
	getLatestServerInstallLog,
	startServerInstall,
	streamServerInstallEvents,
} from "./install";
import { clearLogs, getLogs } from "./logs";
import {
	saveProviderConfig,
	saveSubscriptionConfig,
	testProviderConfig,
	testSubscriptionConfig,
} from "./providers";
import {
	completeCodexAuth,
	getCodexAuthStatus,
	startCodexAuth,
} from "./providers/codex-auth";
import { getServerDetail, runServerAction } from "./server-actions";
import {
	acceptHostKey,
	connectServer,
	deleteServer,
	listServers,
	updateServer,
} from "./servers";
import { deployPersonaToHermes, savePersonaSettings } from "./settings";
import {
	createAgentSkill,
	deleteAgentSkill,
	deploySkillsToHermes,
	getRemoteSkillsList,
	updateAgentSkill,
} from "./settings/agent-skills";
import {
	createMcpServer,
	deleteMcpServer,
	deployMcpServersToHermes,
	updateMcpServer,
} from "./settings/mcp";
import {
	approveTelegramPairing,
	connectTelegram,
	deployTelegramToServer,
	disconnectTelegram,
	getModelAccessOptionsHandler,
	listTelegramPairings,
	switchModelProvider,
	testTelegramBot,
} from "./telegram";
import {
	deployServerWebUi,
	getServerWebUiStatus,
	proxyServerWebUi,
	revealServerWebUiPassword,
} from "./web-ui";

// 3 requests per 5 minutes per email for magic link sending.
//
// Exported so test code can spy on `.consume()` to verify the normalization
// rules without depending on the internal point-tracking state of this
// module-level singleton (see ADR 0009 — in-memory single-instance limit).
export const magicLinkRateLimiter = new RateLimiterMemory({
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

const httpsMiddleware = createMiddleware(async (c, next) => {
	const result = requireHttps(c);
	if (result) {
		return result;
	}
	await next();
});

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

	if (typeof email !== "string") {
		return null;
	}

	// Normalize the limiter key so that `A@x.com`, `a@X.COM`, and
	// ` a@x.com ` all share the same limiter slot. Without normalization
	// each permutation would reset the 3-per-5-minute budget and an
	// attacker could ship unbounded magic-link emails.
	const normalizedEmail = email.trim().toLowerCase();

	// Empty body — pass through to Better Auth. Better Auth rejects
	// non-string or empty emails upstream before any SMTP work, so
	// consuming a limiter point here would only penalize legitimate
	// callers that don't carry an `email` field at all.
	if (normalizedEmail.length === 0) {
		return null;
	}

	// RFC 5321 practical limit (320 chars: 64 local + 1 `@` + 255
	// domain). Overlong inputs are unambiguously hostile — fail-fast
	// with 400 before consuming an SMTP slot, a Better Auth cycle, or
	// a rate-limiter point.
	//
	// This replaces plan 001's "ignored like today" pass-through: gemini
	// flagged that silently dropping the request still let Better Auth
	// process a 400-char email. The empty-email branch above preserves
	// plan 001's pass-through behavior for legitimate non-magic-link
	// callers; only unambiguous-input-attack inputs fail closed here.
	if (normalizedEmail.length > 320) {
		return Response.json(
			{
				error: "Invalid email address.",
			},
			{ status: 400 },
		);
	}

	try {
		await magicLinkRateLimiter.consume(normalizedEmail);
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
apiApp.post("/servers/connect", httpsMiddleware, connectServer);
apiApp.get("/servers/:id", getServerDetail);
apiApp.patch("/servers/:id", httpsMiddleware, updateServer);
apiApp.delete("/servers/:id", httpsMiddleware, deleteServer);
apiApp.post("/servers/:id/install", httpsMiddleware, startServerInstall);
apiApp.get("/servers/:id/install/events", streamServerInstallEvents);
apiApp.get("/servers/:id/install/log", getLatestServerInstallLog);
apiApp.post("/servers/:id/actions", httpsMiddleware, runServerAction);
apiApp.post("/servers/:id/health-check", httpsMiddleware, runServerHealthCheck);
apiApp.get("/servers/:id/web-ui", httpsMiddleware, getServerWebUiStatus);
apiApp.post("/servers/:id/web-ui/deploy", httpsMiddleware, deployServerWebUi);
apiApp.get(
	"/servers/:id/web-ui/password",
	httpsMiddleware,
	revealServerWebUiPassword,
);
// Proxy root forwards upstream /; the catch-all handles nested proxied assets.
apiApp.all("/servers/:id/web-ui/proxy", httpsMiddleware, proxyServerWebUi);
apiApp.all("/servers/:id/web-ui/proxy/*", httpsMiddleware, proxyServerWebUi);
apiApp.post("/servers/:id/host-key/accept", httpsMiddleware, acceptHostKey);
apiApp.get("/dashboard/status", getDashboardStatus);
apiApp.get("/logs", getLogs);
apiApp.post("/logs/clear", httpsMiddleware, clearLogs);
apiApp.post("/providers", httpsMiddleware, saveProviderConfig);
apiApp.post(
	"/providers/subscriptions",
	httpsMiddleware,
	saveSubscriptionConfig,
);
apiApp.post(
	"/providers/subscriptions/test",
	httpsMiddleware,
	testSubscriptionConfig,
);
apiApp.post("/providers/test", httpsMiddleware, testProviderConfig);
apiApp.post("/providers/deploy", httpsMiddleware, deployProviderToHermes);
apiApp.post("/providers/codex-auth/start", httpsMiddleware, startCodexAuth);
apiApp.post(
	"/providers/codex-auth/complete",
	httpsMiddleware,
	completeCodexAuth,
);
apiApp.get("/providers/codex-auth/status", httpsMiddleware, getCodexAuthStatus);
apiApp.post("/settings/persona", httpsMiddleware, savePersonaSettings);
apiApp.post("/settings/persona/deploy", httpsMiddleware, deployPersonaToHermes);
apiApp.post("/settings/mcp-servers", httpsMiddleware, createMcpServer);
apiApp.put("/settings/mcp-servers/:id", httpsMiddleware, updateMcpServer);
apiApp.delete("/settings/mcp-servers/:id", httpsMiddleware, deleteMcpServer);
apiApp.post(
	"/settings/mcp-servers/deploy",
	httpsMiddleware,
	deployMcpServersToHermes,
);
apiApp.post("/settings/agent-skills", httpsMiddleware, createAgentSkill);
apiApp.put("/settings/agent-skills/:id", httpsMiddleware, updateAgentSkill);
apiApp.delete("/settings/agent-skills/:id", httpsMiddleware, deleteAgentSkill);
apiApp.post(
	"/settings/agent-skills/deploy",
	httpsMiddleware,
	deploySkillsToHermes,
);
apiApp.post(
	"/settings/agent-skills/remote-list",
	httpsMiddleware,
	getRemoteSkillsList,
);
apiApp.post("/telegram/connect", httpsMiddleware, connectTelegram);
apiApp.post("/telegram/disconnect", httpsMiddleware, disconnectTelegram);
apiApp.post("/telegram/deploy", httpsMiddleware, deployTelegramToServer);
apiApp.post("/telegram/test", httpsMiddleware, testTelegramBot);
apiApp.post("/telegram/model-switch", httpsMiddleware, switchModelProvider);
apiApp.get("/telegram/model-access-options", getModelAccessOptionsHandler);
apiApp.get("/telegram/pairings", listTelegramPairings);
apiApp.post(
	"/telegram/pairings/approve",
	httpsMiddleware,
	approveTelegramPairing,
);
