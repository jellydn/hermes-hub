import { describe, expect, it, vi } from "vitest";

vi.mock("./db/health", () => ({
	checkDatabaseConnection: vi.fn(),
}));

const connectServer = vi.fn();
const startServerInstall = vi.fn();
const streamServerInstallEvents = vi.fn();

vi.mock("./servers", () => ({
	connectServer,
}));

vi.mock("./install", () => ({
	startServerInstall,
	streamServerInstallEvents,
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
});
