import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	connectServer,
	listServers,
	updateServer,
	deleteServer,
	acceptHostKey,
	getServerDetail,
	runServerAction,
	runServerHealthCheck,
	startServerInstall,
	streamServerInstallEvents,
	getLatestServerInstallLog,
	getDashboardStatus,
	getLogs,
	clearLogs,
	deployProviderToHermes,
	saveProviderConfig,
	saveSubscriptionConfig,
	testProviderConfig,
	testSubscriptionConfig,
	connectTelegram,
	disconnectTelegram,
	deployTelegramToServer,
	testTelegramBot,
	listTelegramPairings,
	approveTelegramPairing,
	deployServerWebUi,
	getServerWebUiStatus,
	revealServerWebUiPassword,
	proxyServerWebUi,
	savePersonaSettings,
	deployPersonaToHermes,
	createMcpServer,
	updateMcpServer,
	deleteMcpServer,
	deployMcpServersToHermes,
	authHandler,
	hasDatabaseUrl,
} = vi.hoisted(() => ({
	connectServer: vi.fn(),
	listServers: vi.fn(),
	updateServer: vi.fn(),
	deleteServer: vi.fn(),
	acceptHostKey: vi.fn(),
	getServerDetail: vi.fn(),
	runServerAction: vi.fn(),
	runServerHealthCheck: vi.fn(),
	startServerInstall: vi.fn(),
	streamServerInstallEvents: vi.fn(),
	getLatestServerInstallLog: vi.fn(),
	getDashboardStatus: vi.fn(),
	getLogs: vi.fn(),
	clearLogs: vi.fn(),
	deployProviderToHermes: vi.fn(),
	saveProviderConfig: vi.fn(),
	saveSubscriptionConfig: vi.fn(),
	testProviderConfig: vi.fn(),
	testSubscriptionConfig: vi.fn(),
	connectTelegram: vi.fn(),
	disconnectTelegram: vi.fn(),
	deployTelegramToServer: vi.fn(),
	testTelegramBot: vi.fn(),
	listTelegramPairings: vi.fn(),
	approveTelegramPairing: vi.fn(),
	deployServerWebUi: vi.fn(),
	getServerWebUiStatus: vi.fn(),
	revealServerWebUiPassword: vi.fn(),
	proxyServerWebUi: vi.fn(),
	savePersonaSettings: vi.fn(),
	deployPersonaToHermes: vi.fn(),
	createMcpServer: vi.fn(),
	updateMcpServer: vi.fn(),
	deleteMcpServer: vi.fn(),
	deployMcpServersToHermes: vi.fn(),
	authHandler: vi.fn(),
	hasDatabaseUrl: vi.fn(() => true),
}));

vi.mock("./db/health", () => ({
	checkDatabaseConnection: vi.fn(),
}));

vi.mock("./servers", () => ({
	connectServer,
	listServers,
	updateServer,
	deleteServer,
	acceptHostKey,
}));

vi.mock("./health-check", () => ({
	runServerHealthCheck,
}));

vi.mock("./server-actions", () => ({
	getServerDetail,
	runServerAction,
}));

vi.mock("./install", () => ({
	startServerInstall,
	streamServerInstallEvents,
	getLatestServerInstallLog,
}));

vi.mock("./dashboard", () => ({
	getDashboardStatus,
}));

vi.mock("./logs", () => ({
	getLogs,
	clearLogs,
}));

vi.mock("./providers", () => ({
	deployProviderToHermes,
	saveProviderConfig,
	saveSubscriptionConfig,
	testProviderConfig,
	testSubscriptionConfig,
}));

vi.mock("./telegram", () => ({
	approveTelegramPairing,
	connectTelegram,
	disconnectTelegram,
	deployTelegramToServer,
	getModelAccessOptionsHandler: vi.fn(),
	listTelegramPairings,
	switchModelProvider: vi.fn(),
	testTelegramBot,
}));

vi.mock("./web-ui", () => ({
	deployServerWebUi,
	getServerWebUiStatus,
	revealServerWebUiPassword,
	proxyServerWebUi,
}));

vi.mock("./settings", () => ({
	savePersonaSettings,
	deployPersonaToHermes,
}));

vi.mock("./settings/mcp", () => ({
	createMcpServer,
	updateMcpServer,
	deleteMcpServer,
	deployMcpServersToHermes,
}));

vi.mock("./auth", () => ({
	getAuth: () => ({
		handler: authHandler,
	}),
	hasDatabaseUrl,
}));

import { apiApp, magicLinkRateLimiter } from "./app";

describe("apiApp", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hasDatabaseUrl.mockReturnValue(true);
	});
	it("returns health status for GET /api/health", async () => {
		const response = await apiApp.request("http://localhost/api/health");
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toMatchObject({
			status: "ok",
			database: "connected",
		});
		expect(payload.timestamp).toEqual(expect.any(String));
	});

	it("routes send magic link requests through Better Auth", async () => {
		authHandler.mockResolvedValueOnce(
			new Response(JSON.stringify({ status: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/auth/send-magic-link",
			{
				method: "POST",
				body: JSON.stringify({ email: "test@example.com" }),
				headers: { "content-type": "application/json" },
			},
		);

		expect(response.status).toBe(200);
		expect(authHandler).toHaveBeenCalledTimes(1);

		const [request] = authHandler.mock.calls[0] ?? [];
		expect(request).toBeInstanceOf(Request);
		expect((request as Request).url).toBe(
			"http://localhost/api/auth/sign-in/magic-link",
		);
	});

	it("catch-all auth route handles verify magic link requests", async () => {
		authHandler.mockResolvedValueOnce(
			new Response(JSON.stringify({ session: {}, user: {} }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/auth/verify-magic-link?token=abc&callbackURL=%2Fdashboard",
		);

		expect(response.status).toBe(200);
		expect(authHandler).toHaveBeenCalledTimes(1);

		const [request] = authHandler.mock.calls[0] ?? [];
		expect(request).toBeInstanceOf(Request);
		expect((request as Request).url).toBe(
			"http://localhost/api/auth/verify-magic-link?token=abc&callbackURL=%2Fdashboard",
		);
	});

	it("catch-all auth route handles auth callback requests", async () => {
		authHandler.mockResolvedValueOnce(
			new Response(JSON.stringify({ session: {}, user: {} }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/auth/callback?token=abc&callbackURL=%2Fdashboard",
		);

		expect(response.status).toBe(200);
		expect(authHandler).toHaveBeenCalledTimes(1);

		const [request] = authHandler.mock.calls[0] ?? [];
		expect(request).toBeInstanceOf(Request);
		expect((request as Request).url).toBe(
			"http://localhost/api/auth/callback?token=abc&callbackURL=%2Fdashboard",
		);
	});

	it("returns 503 for auth routes when DATABASE_URL is unavailable", async () => {
		hasDatabaseUrl.mockReturnValue(false);

		const response = await apiApp.request("http://localhost/api/auth/session");

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			error: "DATABASE_URL is required",
		});
		expect(authHandler).not.toHaveBeenCalled();
	});

	it("routes server list requests through the server list handler", async () => {
		listServers.mockResolvedValueOnce(
			new Response(JSON.stringify({ servers: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request("http://localhost/api/servers");

		expect(response.status).toBe(200);
		expect(listServers).toHaveBeenCalledTimes(1);
	});

	it("routes server connect requests through the server connection handler", async () => {
		connectServer.mockResolvedValueOnce(
			new Response(JSON.stringify({ server: { id: "server_123" } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/servers/connect",
			{
				method: "POST",
				body: JSON.stringify({ label: "Prod", host: "203.0.113.10" }),
				headers: { "content-type": "application/json" },
			},
		);

		expect(response.status).toBe(200);
		expect(connectServer).toHaveBeenCalledTimes(1);
	});

	it("routes install start requests through the install handler", async () => {
		startServerInstall.mockResolvedValueOnce(
			new Response(JSON.stringify({ install: { id: "install_123" } }), {
				status: 202,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/servers/server_123/install",
			{
				method: "POST",
			},
		);

		expect(response.status).toBe(202);
		expect(startServerInstall).toHaveBeenCalledTimes(1);
	});

	it("routes server detail requests through the detail handler", async () => {
		getServerDetail.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ serverDetail: { server: { id: "server_123" } } }),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const response = await apiApp.request(
			"http://localhost/api/servers/server_123",
		);

		expect(response.status).toBe(200);
		expect(getServerDetail).toHaveBeenCalledTimes(1);
	});

	it("routes server update requests through the update handler", async () => {
		updateServer.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ serverDetail: { server: { id: "server_123" } } }),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const response = await apiApp.request(
			"http://localhost/api/servers/server_123",
			{
				method: "PATCH",
				body: JSON.stringify({ label: "Primary VPS" }),
				headers: { "content-type": "application/json" },
			},
		);

		expect(response.status).toBe(200);
		expect(updateServer).toHaveBeenCalledTimes(1);
	});

	it("routes server health check requests through the health check handler", async () => {
		runServerHealthCheck.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					healthCheck: {
						status: "healthy",
						checkedAt: "2026-06-06T12:00:00.000Z",
						groups: [],
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const response = await apiApp.request(
			"http://localhost/api/servers/server_123/health-check",
			{ method: "POST" },
		);

		expect(response.status).toBe(200);
		expect(runServerHealthCheck).toHaveBeenCalledTimes(1);
	});

	it("rejects health check requests over plain HTTP in production", async () => {
		const previousNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";

		try {
			const response = await apiApp.request(
				"http://localhost/api/servers/server_123/health-check",
				{ method: "POST" },
			);

			expect(response.status).toBe(426);
			expect(await response.json()).toEqual({
				error:
					"HTTPS required. Use a secure connection to access this endpoint.",
			});
			expect(runServerHealthCheck).not.toHaveBeenCalled();
		} finally {
			process.env.NODE_ENV = previousNodeEnv;
		}
	});

	it("routes server action requests through the action handler", async () => {
		runServerAction.mockResolvedValueOnce(
			new Response(JSON.stringify({ status: "succeeded", action: "restart" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/servers/server_123/actions",
			{
				method: "POST",
				body: JSON.stringify({ action: "restart" }),
				headers: { "content-type": "application/json" },
			},
		);

		expect(response.status).toBe(200);
		expect(runServerAction).toHaveBeenCalledTimes(1);
	});

	it("routes install event requests through the install stream handler", async () => {
		streamServerInstallEvents.mockResolvedValueOnce(
			new Response("event: install-progress\ndata: {}\n\n", {
				status: 200,
				headers: { "content-type": "text/event-stream" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/servers/server_123/install/events",
		);

		expect(response.status).toBe(200);
		expect(streamServerInstallEvents).toHaveBeenCalledTimes(1);
	});

	it("routes dashboard status requests through the dashboard handler", async () => {
		getDashboardStatus.mockResolvedValueOnce(
			new Response(JSON.stringify({ dashboard: { generatedAt: "now" } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/dashboard/status",
		);

		expect(response.status).toBe(200);
		expect(getDashboardStatus).toHaveBeenCalledTimes(1);
	});

	it("routes logs requests through the logs handler", async () => {
		getLogs.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ logs: { installLogs: [], actionLogs: [] } }),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const response = await apiApp.request("http://localhost/api/logs");

		expect(response.status).toBe(200);
		expect(getLogs).toHaveBeenCalledTimes(1);
	});

	it("routes clear log requests through the logs handler", async () => {
		clearLogs.mockResolvedValueOnce(
			new Response(JSON.stringify({ status: "cleared" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request("http://localhost/api/logs/clear", {
			method: "POST",
		});

		expect(response.status).toBe(200);
		expect(clearLogs).toHaveBeenCalledTimes(1);
	});

	it("routes provider save requests through the provider handler", async () => {
		saveProviderConfig.mockResolvedValueOnce(
			new Response(JSON.stringify({ provider: { provider: "openai" } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request("http://localhost/api/providers", {
			method: "POST",
			body: JSON.stringify({ provider: "openai", model: "gpt-4o-mini" }),
			headers: { "content-type": "application/json" },
		});

		expect(response.status).toBe(200);
		expect(saveProviderConfig).toHaveBeenCalledTimes(1);
	});

	it("routes provider test requests through the provider test handler", async () => {
		testProviderConfig.mockResolvedValueOnce(
			new Response(JSON.stringify({ status: "connected" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/providers/test",
			{
				method: "POST",
				body: JSON.stringify({ provider: "openai", model: "gpt-4o-mini" }),
				headers: { "content-type": "application/json" },
			},
		);

		expect(response.status).toBe(200);
		expect(testProviderConfig).toHaveBeenCalledTimes(1);
	});

	it("routes Telegram connect requests through the Telegram handler", async () => {
		connectTelegram.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ telegram: { botUsername: "hermes_helper_bot" } }),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const response = await apiApp.request(
			"http://localhost/api/telegram/connect",
			{
				method: "POST",
				body: JSON.stringify({ botToken: "123456:secret-token" }),
				headers: { "content-type": "application/json" },
			},
		);

		expect(response.status).toBe(200);
		expect(connectTelegram).toHaveBeenCalledTimes(1);
	});

	it("routes Web UI status requests through the Web UI handler", async () => {
		getServerWebUiStatus.mockResolvedValueOnce(
			new Response(JSON.stringify({ webUi: { deployStatus: "succeeded" } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/servers/server_123/web-ui",
		);

		expect(response.status).toBe(200);
		expect(getServerWebUiStatus).toHaveBeenCalledTimes(1);
	});

	it("routes Web UI deploy requests through the Web UI handler", async () => {
		deployServerWebUi.mockResolvedValueOnce(
			new Response(JSON.stringify({ status: "deploying" }), {
				status: 202,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/servers/server_123/web-ui/deploy",
			{ method: "POST" },
		);

		expect(response.status).toBe(202);
		expect(deployServerWebUi).toHaveBeenCalledTimes(1);
	});

	it("routes Web UI password reveal requests through the Web UI handler", async () => {
		revealServerWebUiPassword.mockResolvedValueOnce(
			new Response(JSON.stringify({ password: "generated-password" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/servers/server_123/web-ui/password",
		);

		expect(response.status).toBe(200);
		expect(revealServerWebUiPassword).toHaveBeenCalledTimes(1);
	});

	it("routes Web UI proxy requests through the Web UI handler", async () => {
		proxyServerWebUi.mockResolvedValueOnce(
			new Response("ok", {
				status: 200,
				headers: { "content-type": "text/plain" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/servers/server_123/web-ui/proxy/",
		);

		expect(response.status).toBe(200);
		expect(proxyServerWebUi).toHaveBeenCalledTimes(1);
	});

	it("routes persona save requests through the settings handler", async () => {
		savePersonaSettings.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					settings: { agentPersona: "You are Hermes." },
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const response = await apiApp.request(
			"http://localhost/api/settings/persona",
			{
				method: "POST",
				body: JSON.stringify({ agentPersona: "You are Hermes." }),
				headers: { "content-type": "application/json" },
			},
		);

		expect(response.status).toBe(200);
		expect(savePersonaSettings).toHaveBeenCalledTimes(1);
	});

	it("routes persona deploy requests through the settings handler", async () => {
		deployPersonaToHermes.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					status: "deployed",
					serverHost: "1.2.3.4",
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const response = await apiApp.request(
			"http://localhost/api/settings/persona/deploy",
			{ method: "POST" },
		);

		expect(response.status).toBe(200);
		expect(deployPersonaToHermes).toHaveBeenCalledTimes(1);
	});

	it("routes MCP deploy requests through the MCP settings handler", async () => {
		deployMcpServersToHermes.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					status: "deployed",
					serverHost: "1.2.3.4",
					serverCount: 1,
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const response = await apiApp.request(
			"http://localhost/api/settings/mcp-servers/deploy",
			{ method: "POST" },
		);

		expect(response.status).toBe(200);
		expect(deployMcpServersToHermes).toHaveBeenCalledTimes(1);
	});

	it("rejects mutating MCP routes over plain HTTP in production", async () => {
		const previousNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";

		try {
			const createResponse = await apiApp.request(
				"http://localhost/api/settings/mcp-servers",
				{
					method: "POST",
					body: JSON.stringify({ name: "github", transport: "stdio" }),
					headers: { "content-type": "application/json" },
				},
			);
			const deployResponse = await apiApp.request(
				"http://localhost/api/settings/mcp-servers/deploy",
				{ method: "POST" },
			);

			expect(createResponse.status).toBe(426);
			expect(deployResponse.status).toBe(426);
			expect(createMcpServer).not.toHaveBeenCalled();
			expect(deployMcpServersToHermes).not.toHaveBeenCalled();
		} finally {
			process.env.NODE_ENV = previousNodeEnv;
		}
	});

	it("rejects mutating persona routes over plain HTTP in production", async () => {
		const previousNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";

		try {
			const saveResponse = await apiApp.request(
				"http://localhost/api/settings/persona",
				{
					method: "POST",
					body: JSON.stringify({ agentPersona: "You are Hermes." }),
					headers: { "content-type": "application/json" },
				},
			);
			const deployResponse = await apiApp.request(
				"http://localhost/api/settings/persona/deploy",
				{ method: "POST" },
			);

			expect(saveResponse.status).toBe(426);
			expect(deployResponse.status).toBe(426);
			expect(savePersonaSettings).not.toHaveBeenCalled();
			expect(deployPersonaToHermes).not.toHaveBeenCalled();
		} finally {
			process.env.NODE_ENV = previousNodeEnv;
		}
	});

	it("routes Telegram disconnect requests through the Telegram handler", async () => {
		disconnectTelegram.mockResolvedValueOnce(
			new Response(JSON.stringify({ status: "disconnected" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await apiApp.request(
			"http://localhost/api/telegram/disconnect",
			{
				method: "POST",
			},
		);
		expect(response.status).toBe(200);
		expect(disconnectTelegram).toHaveBeenCalledTimes(1);
	});
});

describe("magic-link rate limiter normalization", () => {
	let consumeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// Reset all mock implementations between tests so the multi-call
		// `authHandler.mockResolvedValue(...)` from one test does not bleed
		// into the next test's call count.
		vi.resetAllMocks();
		// Spy on `consume` so the route's normalize/trim logic runs against
		// the real controller code while the limiter's point-tracking state
		// is inert. Spy is restored in afterEach so other describe blocks
		// observe the real limiter.
		// `RateLimiterMemory.consume()` returns `RateLimiterRes`; vi.spyOn
		// locks the parameter type to that contract. Tests don't observe the
		// return shape, so the `as never` cast bypasses the typed contract.
		consumeSpy = vi
			.spyOn(magicLinkRateLimiter, "consume")
			.mockResolvedValue(undefined as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function postMagicLink(email: string): Promise<Response> {
		// `apiApp.request` is typed as `Response | Promise<Response>` because
		// Hono handlers may return synchronously or asynchronously; the route
		// we hit here is async, so coerce the return type to keep the test
		// bodies strictly typed.
		return apiApp.request("http://localhost/api/auth/send-magic-link", {
			method: "POST",
			body: JSON.stringify({ email }),
			headers: { "content-type": "application/json" },
		}) as Promise<Response>;
	}

	it("normalizes email casing and whitespace before consuming", async () => {
		authHandler.mockResolvedValue(
			new Response(JSON.stringify({ status: "ok" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		await postMagicLink("A@x.com");
		await postMagicLink("a@X.COM");
		await postMagicLink(" a@x.com ");

		expect(consumeSpy).toHaveBeenCalledTimes(3);
		expect(
			consumeSpy.mock.calls.map((args: readonly unknown[]) => String(args[0])),
		).toEqual(["a@x.com", "a@x.com", "a@x.com"]);
	});

	it("does not consume for emails longer than 320 chars", async () => {
		authHandler.mockResolvedValue(
			new Response(JSON.stringify({ status: "ok" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const longEmail = `${"a".repeat(400)}@x.com`;
		const response = await postMagicLink(longEmail);

		expect(response.status).toBe(200);
		expect(authHandler).toHaveBeenCalledTimes(1);
		expect(consumeSpy).not.toHaveBeenCalled();
	});

	it("rejects the 4th request after 3 normalized consumes", async () => {
		authHandler.mockResolvedValue(
			new Response(JSON.stringify({ status: "ok" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		// 4th call rejects, simulating the limiter reporting "rate-limited"
		// after a 3-of-3 window. Reset the default-resolved spy so this
		// per-call sequence is the only behavior.
		consumeSpy.mockReset();
		consumeSpy.mockResolvedValueOnce(undefined as never);
		consumeSpy.mockResolvedValueOnce(undefined as never);
		consumeSpy.mockResolvedValueOnce(undefined as never);
		consumeSpy.mockRejectedValueOnce(new Error("rate-limited"));
		// Sentinel: any consume() call beyond the 4 queued slots would
		// otherwise fall back to the real limiter implementation (and silently
		// deplete the module-level point tracker). Make extra calls loud.
		consumeSpy.mockImplementation(() => {
			throw new Error("unexpected consume() call beyond the 4 queued slots");
		});

		// Sequential `await` (not `Promise.all`) so the spy mock FIFO order
		// and the response-array index agree — `responses[3]` is the request
		// that hit the rate limit, not just the slowest concurrent one.
		const responses: Response[] = [];
		responses.push(await postMagicLink("A@x.com"));
		responses.push(await postMagicLink("a@X.COM"));
		responses.push(await postMagicLink(" a@x.com "));
		responses.push(await postMagicLink("a@x.com"));

		expect(responses.slice(0, 3).map((r) => r.status)).toEqual([200, 200, 200]);
		expect(responses[3].status).toBe(429);
		const payload = await responses[3].json();
		expect(payload.error).toMatch(/Too many requests/);
	});
});
