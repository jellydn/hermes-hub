// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import type { ServerListSummary } from "#/lib/servers";

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

vi.mock("#server/servers", () => ({
	getServerListSnapshot: vi.fn(),
}));

import {
	assertRouteComponent,
	createMockSession,
} from "#/test-helpers/route-mocks";
import { getAuthSession } from "#server/auth";
import { getServerListSnapshot } from "#server/servers";
import { Route } from "./servers.index";

describe("/servers/ route", () => {
	it("renders ServersIndexPage component", () => {
		assertRouteComponent(Route, "ServersIndexPage");
	});

	it("has beforeLoad defined for auth guard", () => {
		expect(Route.options?.beforeLoad).toBeDefined();
	});

	it("returns session and servers list from beforeLoad", async () => {
		const mockServers = [
			{
				id: "server_1",
				label: "Production",
				host: "1.2.3.4",
				status: "connected",
				osName: "Ubuntu",
				osVersion: "24.04",
				supportLevel: "supported",
				installStatus: "succeeded",
				installUpdatedAt: "2026-06-16T00:00:00.000Z",
				lastActionAt: null,
				lastActivityAt: "2026-06-16T00:00:00.000Z",
			} satisfies ServerListSummary,
		];

		vi.mocked(getAuthSession).mockResolvedValue(createMockSession());
		vi.mocked(getServerListSnapshot).mockResolvedValue(
			mockServers as unknown as Awaited<
				ReturnType<typeof getServerListSnapshot>
			>,
		);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/servers" },
		} as never);

		expect(result).toHaveProperty("session");
		expect(result).toHaveProperty("servers");
		expect(result.servers).toHaveLength(1);
	});

	it("returns empty array when unauthenticated", async () => {
		vi.mocked(getAuthSession).mockResolvedValue(null);
		vi.mocked(getServerListSnapshot).mockResolvedValue([]);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/servers" },
		} as never);

		expect(result).toHaveProperty("session");
		expect(result.servers).toEqual([]);
	});
});
