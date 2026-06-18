// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
	assertRouteComponent,
	createMockSession,
	createRouterMock,
	createSessionResolverMock,
	createStartMock,
	createStartServerMock,
} from "./route-mocks";

describe("createMockSession", () => {
	it("returns an object with user and session", () => {
		const session = createMockSession();
		expect(session).toHaveProperty("user");
		expect(session).toHaveProperty("session");
		expect(session.user).toHaveProperty("id", "user_1");
		expect(session.session).toHaveProperty("id", "session_1");
	});

	it("accepts custom IDs", () => {
		const session = createMockSession("custom_user", "custom_session");
		expect(session.user.id).toBe("custom_user");
		expect(session.session.id).toBe("custom_session");
	});
});

describe("assertRouteComponent", () => {
	it("does not throw when component name matches", () => {
		expect(() =>
			assertRouteComponent(
				{ component: { name: "DashboardPage" } },
				"DashboardPage",
			),
		).not.toThrow();
	});

	it("throws when component name does not match", () => {
		expect(() =>
			assertRouteComponent(
				{ component: { name: "WrongPage" } },
				"DashboardPage",
			),
		).toThrow('Expected route component "DashboardPage", got "WrongPage"');
	});

	it("throws when component is missing", () => {
		expect(() => assertRouteComponent({}, "DashboardPage")).toThrow(
			'Expected route component "DashboardPage", got "undefined"',
		);
	});
});

describe("createRouterMock", () => {
	it("returns expected mock shape", () => {
		const mock = createRouterMock();
		expect(mock).toHaveProperty("createFileRoute");
		expect(mock).toHaveProperty("getRouteApi");
		expect(mock).toHaveProperty("Link");
		expect(mock).toHaveProperty("useNavigate");
	});

	it("createFileRoute returns route config with options and component", () => {
		const mock = createRouterMock();
		const route = mock.createFileRoute()({
			beforeLoad: () => ({ session: {} }),
			component: () => null,
		});
		expect(route.options).toHaveProperty("beforeLoad");
		expect(route).toHaveProperty("component");
	});

	it("useNavigate returns a mock function", () => {
		const mock = createRouterMock();
		expect(typeof mock.useNavigate()).toBe("function");
	});
});

describe("createStartMock", () => {
	it("returns expected mock shape", () => {
		const mock = createStartMock();
		expect(mock).toHaveProperty("createServerFn");
	});

	it("createServerFn handler passes through the function", () => {
		const mock = createStartMock();
		const fn = () => "result";
		const serverFn = mock.createServerFn();
		expect(serverFn.handler(fn)).toBe(fn);
	});
});

describe("createSessionResolverMock", () => {
	it("returns requireSession that resolves a session", async () => {
		const mock = createSessionResolverMock();
		const result = await mock.requireSession();
		expect(result).toHaveProperty("user");
		expect(result).toHaveProperty("session");
	});

	it("requireSession is a vi mock function", () => {
		const mock = createSessionResolverMock();
		expect(vi.isMockFunction(mock.requireSession)).toBe(true);
	});
});

describe("createStartServerMock", () => {
	it("returns getRequestHeaders", () => {
		const mock = createStartServerMock();
		expect(mock).toHaveProperty("getRequestHeaders");
	});

	it("getRequestHeaders returns an empty object", () => {
		const mock = createStartServerMock();
		expect(mock.getRequestHeaders()).toEqual({});
	});
});
