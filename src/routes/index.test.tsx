// @vitest-environment happy-dom

import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => {
	const MockLink = ({ children, to, ...props }: Record<string, unknown>) =>
		React.createElement(
			"a",
			{ href: to as string, ...props },
			children as React.ReactNode,
		);

	return {
		createFileRoute: () => (config: Record<string, unknown>) => ({
			options: {
				beforeLoad: config.beforeLoad,
				head: config.head,
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

vi.mock("#/lib/session", () => ({
	getCurrentSession: vi.fn(),
}));

import { getCurrentSession } from "#/lib/session";
import { Route } from "./index";

describe("/ (landing) route", () => {
	it("renders LandingPage component", () => {
		expect(
			(Route as unknown as { component?: { name: string } }).component?.name,
		).toBe("LandingPage");
	});

	it("has beforeLoad defined", () => {
		expect(Route.options?.beforeLoad).toBeDefined();
	});

	it("redirects to dashboard when authenticated", async () => {
		vi.mocked(getCurrentSession).mockResolvedValue({
			user: { id: "user_1" } as never,
			session: { id: "session_1" } as never,
		});

		await expect(
			// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
			Route.options.beforeLoad!({ location: { href: "/" } } as never),
		).rejects.toThrow("Redirect");
	});

	it("does nothing when unauthenticated", async () => {
		vi.mocked(getCurrentSession).mockResolvedValue(null);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/" },
		} as never);

		expect(result).toBeUndefined();
	});

	it("sets head metadata with landing page description", () => {
		const head = (
			Route as unknown as { options?: { head?: () => unknown } }
		).options?.head?.() as { meta?: Array<Record<string, string>> } | undefined;
		const meta = head?.meta ?? [];
		expect(meta).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "description",
				}),
			]),
		);
	});

	it("sets head metadata with landing page title", () => {
		const head = (
			Route as unknown as { options?: { head?: () => unknown } }
		).options?.head?.() as { meta?: Array<Record<string, string>> } | undefined;
		const meta = head?.meta ?? [];
		expect(meta).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					title: expect.stringContaining("HermesHub"),
				}),
			]),
		);
	});
});
