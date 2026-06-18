import React from "react";
import { vi } from "vitest";
import type { getAuthSession } from "#server/auth";

// ---------------------------------------------------------------------------
// Auth session mock
// ---------------------------------------------------------------------------

/** The non-null return type of `getAuthSession`. */
export type AuthSession = NonNullable<
	Awaited<ReturnType<typeof getAuthSession>>
>;

/**
 * Create a mock auth session for use with
 * `vi.mocked(getAuthSession).mockResolvedValue(...)`.
 */
export function createMockSession(
	userId = "user_1",
	sessionId = "session_1",
): AuthSession {
	return {
		user: { id: userId } as AuthSession["user"],
		session: { id: sessionId } as AuthSession["session"],
	};
}

// ---------------------------------------------------------------------------
// Route component assertion
// ---------------------------------------------------------------------------

/** Assert that a route exports a component with the expected display name. */
export function assertRouteComponent(route: unknown, expectedName: string) {
	const name = (route as { component?: { name: string } }).component?.name;
	if (name !== expectedName) {
		throw new Error(
			`Expected route component "${expectedName}", got "${name}"`,
		);
	}
}

// ---------------------------------------------------------------------------
// TanStack Router mock
// ---------------------------------------------------------------------------

/** Create a standard `@tanstack/react-router` mock compatible with route tests. */
export function createRouterMock() {
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
}

// ---------------------------------------------------------------------------
// TanStack Start mock
// ---------------------------------------------------------------------------

/** Create a standard `@tanstack/react-start` mock. */
export function createStartMock() {
	return {
		// biome-ignore lint/complexity/noBannedTypes: Function type in mock
		createServerFn: () => ({ handler: (fn: Function) => fn }),
	};
}

// ---------------------------------------------------------------------------
// Session loader mock — used by `vi.mock("#/lib/session", ...)`
// ---------------------------------------------------------------------------

/** Create a standard `#/lib/session` mock factory for `requireSession`. */
export function createSessionResolverMock() {
	return {
		requireSession: vi.fn(() => Promise.resolve(createMockSession())),
	};
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Create a standard `@tanstack/react-start/server` mock. */
export function createStartServerMock() {
	return {
		getRequestHeaders: vi.fn(() => ({})),
	};
}
