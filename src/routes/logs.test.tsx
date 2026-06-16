// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		// biome-ignore lint/complexity/noBannedTypes: Function type used in mock handler
		handler: (fn: Function) => fn,
	}),
}));

vi.mock("@tanstack/react-router", () => {
	const MockLink = ({ children, to, ...props }: Record<string, unknown>) =>
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

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: vi.fn(() => ({})),
}));

vi.mock("#server/auth", () => ({
	getAuthSession: vi.fn(),
}));

vi.mock("#server/logs", () => ({
	getLogsSnapshot: vi.fn(),
}));

import { getAuthSession } from "#server/auth";
import { getLogsSnapshot } from "#server/logs";
import { Route } from "./logs";

describe("/logs route", () => {
	it("renders LogsPage component", () => {
		expect(Route.component?.name).toBe("LogsPage");
	});

	it("has beforeLoad defined for auth guard", () => {
		expect(Route.options?.beforeLoad).toBeDefined();
	});

	it("returns session and logs from beforeLoad", async () => {
		const mockLogs = {
			installLogs: [
				{
					id: "install_1",
					serverLabel: "Production VPS",
					status: "succeeded",
					step: "start-containers",
					createdAt: "2026-06-16T00:00:00.000Z",
					updatedAt: "2026-06-16T00:05:00.000Z",
					lines: ["Docker installed"],
				},
			],
			actionLogs: [
				{
					id: "audit_1",
					serverLabel: "Production VPS",
					action: "restart",
					result: "succeeded",
					createdAt: "2026-06-16T01:00:00.000Z",
					message: "Restarted Hermes successfully.",
				},
			],
		};

		vi.mocked(getAuthSession).mockResolvedValue({
			user: { id: "user_1" },
			session: { id: "session_1" },
		});
		vi.mocked(getLogsSnapshot).mockResolvedValue(mockLogs);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/logs" },
		} as never);

		expect(result).toHaveProperty("session");
		expect(result).toHaveProperty("logs");
		expect(result.logs).toEqual(mockLogs);
	});

	it("returns null logs when unauthenticated", async () => {
		vi.mocked(getAuthSession).mockResolvedValue(null);
		vi.mocked(getLogsSnapshot).mockResolvedValue(null as never);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/logs" },
		} as never);

		expect(result.logs).toBeNull();
	});
});
