import { describe, expect, it, vi } from "vitest";

vi.mock("./db/health", () => ({
	checkDatabaseConnection: vi.fn(),
}));

const connectServer = vi.fn();
const getServerDetail = vi.fn();
const runServerAction = vi.fn();
const startServerInstall = vi.fn();
const streamServerInstallEvents = vi.fn();
const getDashboardStatus = vi.fn();
const getLogs = vi.fn();
const clearLogs = vi.fn();
const saveProviderConfig = vi.fn();
const testProviderConfig = vi.fn();
const connectTelegram = vi.fn();
const disconnectTelegram = vi.fn();

vi.mock("./servers", () => ({
	connectServer,
}));

vi.mock("./server-actions", () => ({
	getServerDetail,
	runServerAction,
}));

vi.mock("./install", () => ({
	startServerInstall,
	streamServerInstallEvents,
}));

vi.mock("./dashboard", () => ({
	getDashboardStatus,
}));

vi.mock("./logs", () => ({
	getLogs,
	clearLogs,
}));

vi.mock("./providers", () => ({
	saveProviderConfig,
	testProviderConfig,
}));

vi.mock("./telegram", () => ({
	connectTelegram,
	disconnectTelegram,
}));

const authHandler = vi.fn();

vi.mock("./auth", () => ({
	getAuth: () => ({
		handler: authHandler,
	}),
	hasDatabaseUrl: () => true,
}));

describe("apiApp", () => {
	it("returns health status for GET /api/health", async () => {
		const { apiApp } = await import("./app");

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

		const { apiApp } = await import("./app");
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

	it("routes verify magic link requests through Better Auth", async () => {
		authHandler.mockResolvedValueOnce(
			new Response(JSON.stringify({ session: {}, user: {} }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const { apiApp } = await import("./app");
		const response = await apiApp.request(
			"http://localhost/api/auth/verify-magic-link?token=abc&callbackURL=%2Fdashboard",
		);

		expect(response.status).toBe(200);
		expect(authHandler).toHaveBeenCalledTimes(2);

		const [request] = authHandler.mock.calls[1] ?? [];
		expect(request).toBeInstanceOf(Request);
		expect((request as Request).url).toBe(
			"http://localhost/api/auth/magic-link/verify?token=abc&callbackURL=%2Fdashboard",
		);
	});

	it("routes auth callback requests through Better Auth", async () => {
		authHandler.mockResolvedValueOnce(
			new Response(JSON.stringify({ session: {}, user: {} }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const { apiApp } = await import("./app");
		const response = await apiApp.request(
			"http://localhost/api/auth/callback?token=abc&callbackURL=%2Fdashboard",
		);

		expect(response.status).toBe(200);
		expect(authHandler).toHaveBeenCalledTimes(3);

		const [request] = authHandler.mock.calls[2] ?? [];
		expect(request).toBeInstanceOf(Request);
		expect((request as Request).url).toBe(
			"http://localhost/api/auth/magic-link/verify?token=abc&callbackURL=%2Fdashboard",
		);
	});

	it("routes server connect requests through the server connection handler", async () => {
		connectServer.mockResolvedValueOnce(
			new Response(JSON.stringify({ server: { id: "server_123" } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const { apiApp } = await import("./app");
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

		const { apiApp } = await import("./app");
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

		const { apiApp } = await import("./app");
		const response = await apiApp.request(
			"http://localhost/api/servers/server_123",
		);

		expect(response.status).toBe(200);
		expect(getServerDetail).toHaveBeenCalledTimes(1);
	});

	it("routes server action requests through the action handler", async () => {
		runServerAction.mockResolvedValueOnce(
			new Response(JSON.stringify({ status: "succeeded", action: "restart" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const { apiApp } = await import("./app");
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

		const { apiApp } = await import("./app");
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

		const { apiApp } = await import("./app");
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

		const { apiApp } = await import("./app");
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

		const { apiApp } = await import("./app");
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

		const { apiApp } = await import("./app");
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

		const { apiApp } = await import("./app");
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

		const { apiApp } = await import("./app");
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

	it("routes Telegram disconnect requests through the Telegram handler", async () => {
		disconnectTelegram.mockResolvedValueOnce(
			new Response(JSON.stringify({ status: "disconnected" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const { apiApp } = await import("./app");
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
