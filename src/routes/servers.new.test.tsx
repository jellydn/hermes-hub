// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => {
	const MockLink = ({
		children,
		to,
		...props
	}: Record<string, unknown>) =>
		React.createElement("a", { href: to, ...props }, children);

	return {
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
		Link: MockLink,
		useNavigate: () => vi.fn(),
	};
});

import React from "react";

vi.mock("#/lib/session", () => ({
	requireSession: vi.fn(() =>
		Promise.resolve({
			user: { id: "user_1", email: "test@example.com", image: null },
			session: { id: "session_1" },
		}),
	),
}));

import { Route } from "./servers.new";

describe("/servers/new route", () => {
	it("renders NewServerPage component", () => {
		expect(Route.component?.name).toBe("NewServerPage");
	});

	it("has beforeLoad defined for auth guard", () => {
		expect(Route.options?.beforeLoad).toBeDefined();
	});

	it("returns session from beforeLoad", async () => {
		const result = await Route.options.beforeLoad!({
			location: { href: "/servers/new" },
		} as never);

		expect(result).toHaveProperty("session");
		expect(result.session.user.id).toBe("user_1");
	});
});
