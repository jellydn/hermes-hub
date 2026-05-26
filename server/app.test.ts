import { describe, expect, it, vi } from "vitest";

vi.mock("./db/health", () => ({
	checkDatabaseConnection: vi.fn(),
}));

const authHandler = vi.fn();

vi.mock("./auth", () => ({
	auth: {
		handler: authHandler,
	},
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
});
