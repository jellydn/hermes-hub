import { describe, expect, it, vi } from "vitest";

vi.mock("./db/health", () => ({
	checkDatabaseConnection: vi.fn(),
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
});
