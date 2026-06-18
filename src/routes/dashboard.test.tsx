// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () => {
	const { createStartMock } = await import("#/test-helpers/route-mocks");
	return createStartMock();
});

vi.mock("@tanstack/react-router", async () => {
	const { createRouterMock } = await import("#/test-helpers/route-mocks");
	return createRouterMock();
});

vi.mock("#/lib/session", async () => {
	const { createSessionResolverMock } = await import(
		"#/test-helpers/route-mocks"
	);
	return createSessionResolverMock();
});

vi.mock("@tanstack/react-start/server", async () => {
	const { createStartServerMock } = await import("#/test-helpers/route-mocks");
	return createStartServerMock();
});

vi.mock("#server/auth", () => ({
	getAuthSession: vi.fn(),
}));

vi.mock("#server/dashboard", () => ({
	getDashboardStatusSnapshot: vi.fn(),
}));

import {
	assertRouteComponent,
	createMockSession,
} from "#/test-helpers/route-mocks";
import { getAuthSession } from "#server/auth";
import { getDashboardStatusSnapshot } from "#server/dashboard";
import { Route } from "./dashboard";

describe("/dashboard route", () => {
	it("renders DashboardPage component", () => {
		assertRouteComponent(Route, "DashboardPage");
	});

	it("has beforeLoad defined for auth guard", () => {
		expect(Route.options?.beforeLoad).toBeDefined();
	});

	it("returns session and dashboardStatus from beforeLoad", async () => {
		const mockSnapshot = {
			generatedAt: "2026-06-16T00:00:00.000Z",
			server: null,
			serverCount: 0,
			agent: null,
			vps: null,
			provider: null,
			telegram: null,
		};

		vi.mocked(getAuthSession).mockResolvedValue(createMockSession());
		vi.mocked(getDashboardStatusSnapshot).mockResolvedValue(
			mockSnapshot as never,
		);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/dashboard" },
		} as never);

		expect(result).toHaveProperty("session");
		expect(result.session).toHaveProperty("user");
		expect(result).toHaveProperty("dashboardStatus");
		expect(result.dashboardStatus).toEqual(mockSnapshot);
	});

	it("returns null dashboardStatus when unauthenticated", async () => {
		vi.mocked(getAuthSession).mockResolvedValue(null);
		vi.mocked(getDashboardStatusSnapshot).mockResolvedValue(null as never);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/dashboard" },
		} as never);

		expect(result).toHaveProperty("session");
		expect(result.dashboardStatus).toBeNull();
	});
});
