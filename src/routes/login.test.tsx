// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => {
	const MockLink = ({ children, to, ...props }: Record<string, unknown>) =>
		(React as any).createElement("a", { href: to, ...props }, children);

	return {
		createFileRoute: () => (config: Record<string, unknown>) => ({
			options: {
				beforeLoad: config.beforeLoad,
				validateSearch: config.validateSearch,
			},
			component: config.component,
		}),
		redirect: class RedirectError extends Error {
			to: string;
			constructor(opts: Record<string, unknown>) {
				super("Redirect");
				this.to = opts.to as string;
			}
		},
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
	getCurrentSession: vi.fn(),
}));

import { getCurrentSession } from "#/lib/session";
import { Route } from "./login";

describe("/login route", () => {
	it("renders LoginPage component", () => {
		expect((Route as any).component?.name).toBe("LoginPage");
	});

	it("has beforeLoad defined", () => {
		expect(Route.options?.beforeLoad).toBeDefined();
	});

	it("redirects to dashboard when authenticated", async () => {
		vi.mocked(getCurrentSession).mockResolvedValue({
			user: { id: "user_1" } as any,
			session: { id: "session_1" } as any,
		});

		await expect(
			// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
			Route.options.beforeLoad!({ location: { href: "/login" } } as never),
		).rejects.toThrow("Redirect");
	});

	it("does nothing when unauthenticated", async () => {
		vi.mocked(getCurrentSession).mockResolvedValue(null);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/login" },
		} as never);

		expect(result).toBeUndefined();
	});

	it("has validateSearch defined", () => {
		expect(Route.options?.validateSearch).toBeDefined();
	});

	it("validateSearch extracts redirect from search params", () => {
		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = (Route as any).options.validateSearch!({
			redirect: "/dashboard",
		} as Record<string, unknown>);

		expect(result).toEqual({ redirect: "/dashboard" });
	});

	it("validateSearch returns undefined for missing redirect", () => {
		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = (Route as any).options.validateSearch!(
			{} as Record<string, unknown>,
		);

		expect(result).toEqual({ redirect: undefined });
	});

	it("validateSearch ignores non-string redirect", () => {
		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = (Route as any).options.validateSearch!({
			redirect: 123,
		} as Record<string, unknown>);

		expect(result).toEqual({ redirect: undefined });
	});
});
