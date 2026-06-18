// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

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

import { assertRouteComponent } from "#/test-helpers/route-mocks";
import { Route } from "./servers.new";

describe("/servers/new route", () => {
	it("renders NewServerPage component", () => {
		assertRouteComponent(Route, "NewServerPage");
	});

	it("has beforeLoad defined for auth guard", () => {
		expect(Route.options?.beforeLoad).toBeDefined();
	});

	it("returns session from beforeLoad", async () => {
		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/servers/new" },
		} as never);

		expect(result).toHaveProperty("session");
		expect(result.session.user.id).toBe("user_1");
	});
});
