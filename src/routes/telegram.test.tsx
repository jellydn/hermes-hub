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
		(React as any).createElement("a", { href: to, ...props }, children);

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
			user: { id: "user_1", email: "test@example.com", image: null } as any,
			session: { id: "session_1" } as any,
		}),
	),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: vi.fn(() => ({})),
}));

vi.mock("#server/auth", () => ({
	getAuthSession: vi.fn(),
}));

vi.mock("#server/telegram", () => ({
	getCurrentTelegramConfig: vi.fn(),
}));

import { getAuthSession } from "#server/auth";
import { getCurrentTelegramConfig } from "#server/telegram";
import { Route } from "./telegram";

describe("/telegram route", () => {
	it("renders TelegramPage component", () => {
		expect((Route as any).component?.name).toBe("TelegramPage");
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

		vi.mocked(getAuthSession).mockResolvedValue({
			user: { id: "user_1" } as any,
			session: { id: "session_1" } as any,
		});
		vi.mocked(getCurrentTelegramConfig).mockResolvedValue(mockConfig as any);

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
