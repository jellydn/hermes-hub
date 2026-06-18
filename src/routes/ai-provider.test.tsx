// @vitest-environment happy-dom

import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		// biome-ignore lint/complexity/noBannedTypes: Function type used in mock handler
		handler: (fn: Function) => fn,
	}),
}));

vi.mock("@tanstack/react-router", () => {
	const MockLink = ({ children, to, ...props }: Record<string, unknown>) =>
		React.createElement(
			"a",
			{ href: to as string, ...props },
			children as React.ReactNode,
		);

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

vi.mock("#/lib/session", () => ({
	requireSession: vi.fn(() =>
		Promise.resolve({
			user: {
				id: "user_1",
				email: "test@example.com",
				image: null,
			} as never,
			session: { id: "session_1" } as never,
		}),
	),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: vi.fn(() => ({})),
}));

vi.mock("#server/auth", () => ({
	getAuthSession: vi.fn(),
}));

vi.mock("#server/providers", () => ({
	getModelAccessSnapshot: vi.fn(),
}));

vi.mock("#/lib/load-telegram-deploy", () => ({
	loadTelegramDeploy: vi.fn(() => Promise.resolve(null)),
}));

import { getAuthSession } from "#server/auth";
import { getModelAccessSnapshot } from "#server/providers";
import { Route } from "./ai-provider";

describe("/ai-provider route", () => {
	it("renders AiProviderPage component", () => {
		expect(
			(Route as unknown as { component?: { name: string } }).component?.name,
		).toBe("AiProviderPage");
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

		vi.mocked(getAuthSession).mockResolvedValue({
			user: { id: "user_1" } as never,
			session: { id: "session_1" } as never,
		});
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
