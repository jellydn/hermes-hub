// @vitest-environment happy-dom

import type { ServerListSummary } from "#/lib/servers";
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

vi.mock("#server/servers", () => ({
	getServerListSnapshot: vi.fn(),
}));

import { Route } from "./servers.index";
import { getAuthSession } from "#server/auth";
import { getServerListSnapshot } from "#server/servers";

describe("/servers/ route", () => {
	it("renders ServersIndexPage component", () => {
		expect(Route.component?.name).toBe("ServersIndexPage");
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

		vi.mocked(getAuthSession).mockResolvedValue({
			user: { id: "user_1" },
			session: { id: "session_1" },
		});
		vi.mocked(getServerListSnapshot).mockResolvedValue(mockServers);

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

		const result = await Route.options.beforeLoad!({
			location: { href: "/servers" },
		} as never);

		expect(result).toHaveProperty("session");
		expect(result.servers).toEqual([]);
	});
});
