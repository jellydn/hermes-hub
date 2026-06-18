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

vi.mock("#server/logs", () => ({
	getLogsSnapshot: vi.fn(),
}));

import {
	assertRouteComponent,
	createMockSession,
} from "#/test-helpers/route-mocks";
import { getAuthSession } from "#server/auth";
import { getLogsSnapshot } from "#server/logs";
import { Route } from "./logs";

describe("/logs route", () => {
	it("renders LogsPage component", () => {
		assertRouteComponent(Route, "LogsPage");
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

		vi.mocked(getAuthSession).mockResolvedValue(createMockSession());
		vi.mocked(getLogsSnapshot).mockResolvedValue(
			mockLogs as unknown as NonNullable<
				Awaited<ReturnType<typeof getLogsSnapshot>>
			>,
		);

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
