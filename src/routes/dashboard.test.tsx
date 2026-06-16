// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (fn: Function) => fn,
	}),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: Record<string, unknown>) => ({
		options: { beforeLoad: config.beforeLoad },
		component: config.component,
	}),
	getRouteApi: () => ({
		useRouteContext: () => ({}),
		useSearch: () => ({}),
		useParams: () => ({}),
		useLoaderData: () => ({}),
	}),
	Link: ({ children, to, ...props }: Record<string, unknown>) =>
		React.createElement("a", { href: to, ...props }, children),
	useNavigate: () => vi.fn(),
}));

import React from "react";

vi.mock("#/lib/session", () => ({
	requireSession: vi.fn(() =>
		Promise.resolve({
			user: { id: "user_1", email: "test@example.com", image: null },
			session: { id: "session_1" },
		}),
	),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: vi.fn(() => ({})),
}));

vi.mock("#server/auth", () => ({
	getAuthSession: vi.fn(),
}));

vi.mock("#server/dashboard", () => ({
	getDashboardStatusSnapshot: vi.fn(),
}));

import { Route } from "./dashboard";
import { getAuthSession } from "#server/auth";
import { getDashboardStatusSnapshot } from "#server/dashboard";

describe("/dashboard route", () => {
	it("renders DashboardPage component", () => {
		expect(Route.component?.name).toBe("DashboardPage");
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

		vi.mocked(getAuthSession).mockResolvedValue({
			user: { id: "user_1" },
			session: { id: "session_1" },
		});
		vi.mocked(getDashboardStatusSnapshot).mockResolvedValue(mockSnapshot);

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

		const result = await Route.options.beforeLoad!({
			location: { href: "/dashboard" },
		} as never);

		expect(result).toHaveProperty("session");
		expect(result.dashboardStatus).toBeNull();
	});
});
