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

vi.mock("#server/telegram", () => ({
	getCurrentTelegramConfig: vi.fn(),
}));

import {
	assertRouteComponent,
	createMockSession,
} from "#/test-helpers/route-mocks";
import { getAuthSession } from "#server/auth";
import { getCurrentTelegramConfig } from "#server/telegram";
import { Route } from "./telegram";

describe("/telegram route", () => {
	it("renders TelegramPage component", () => {
		assertRouteComponent(Route, "TelegramPage");
	});

	it("has beforeLoad defined for auth guard", () => {
		expect(Route.options?.beforeLoad).toBeDefined();
	});

	it("returns session and telegram config from beforeLoad", async () => {
		const mockConfig = {
			botUsername: "hermes_helper_bot",
			botTokenLast4: "1234",
			isActive: true,
			deployedServerHost: "1.2.3.4",
		};

		vi.mocked(getAuthSession).mockResolvedValue(createMockSession());
		vi.mocked(getCurrentTelegramConfig).mockResolvedValue(
			mockConfig as unknown as NonNullable<
				Awaited<ReturnType<typeof getCurrentTelegramConfig>>
			>,
		);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/telegram" },
		} as never);

		expect(result).toHaveProperty("session");
		expect(result).toHaveProperty("telegramConfig");
		expect(result.telegramConfig).toEqual(mockConfig);
	});

	it("returns null telegram config when unauthenticated", async () => {
		vi.mocked(getAuthSession).mockResolvedValue(null);
		vi.mocked(getCurrentTelegramConfig).mockResolvedValue(null as never);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/telegram" },
		} as never);

		expect(result.telegramConfig).toBeNull();
	});
});
