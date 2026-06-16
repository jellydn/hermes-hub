// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (fn: Function) => fn,
	}),
}));

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

import { Route } from "./ai-provider";
import { getAuthSession } from "#server/auth";
import { getModelAccessSnapshot } from "#server/providers";

describe("/ai-provider route", () => {
	it("renders AiProviderPage component", () => {
		expect(Route.component?.name).toBe("AiProviderPage");
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
			user: { id: "user_1" },
			session: { id: "session_1" },
		});
		vi.mocked(getModelAccessSnapshot).mockResolvedValue(mockAccess);

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

		const result = await Route.options.beforeLoad!({
			location: { href: "/ai-provider" },
		} as never);

		expect(result.modelAccess).toBeNull();
	});
});
