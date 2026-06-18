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

vi.mock("#server/providers", () => ({
	getModelAccessSnapshot: vi.fn(),
}));

vi.mock("#/lib/load-telegram-deploy", () => ({
	loadTelegramDeploy: vi.fn(() => Promise.resolve(null)),
}));

import {
	assertRouteComponent,
	createMockSession,
} from "#/test-helpers/route-mocks";
import { getAuthSession } from "#server/auth";
import { getModelAccessSnapshot } from "#server/providers";
import { Route } from "./ai-provider";

describe("/ai-provider route", () => {
	it("renders AiProviderPage component", () => {
		assertRouteComponent(Route, "AiProviderPage");
	});

	it("has beforeLoad defined for auth guard", () => {
		expect(Route.options?.beforeLoad).toBeDefined();
	});

	it("returns session, modelAccess, and telegramDeploy from beforeLoad", async () => {
		const mockAccess = {
			apiProvider: null,
			subscription: null,
			activeBackend: null as string | null,
		};

		vi.mocked(getAuthSession).mockResolvedValue(createMockSession());
		vi.mocked(getModelAccessSnapshot).mockResolvedValue(
			mockAccess as unknown as NonNullable<
				Awaited<ReturnType<typeof getModelAccessSnapshot>>
			>,
		);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/ai-provider" },
		} as never);

		expect(result).toHaveProperty("session");
		expect(result).toHaveProperty("modelAccess");
		expect(result).toHaveProperty("telegramDeploy");
		expect(result.modelAccess).toEqual(mockAccess);
	});

	it("returns null modelAccess when unauthenticated", async () => {
		vi.mocked(getAuthSession).mockResolvedValue(null);
		vi.mocked(getModelAccessSnapshot).mockResolvedValue(null as never);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/ai-provider" },
		} as never);

		expect(result.modelAccess).toBeNull();
	});
});
