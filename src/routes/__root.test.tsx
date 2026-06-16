// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	createRootRoute: (config: Record<string, unknown>) => ({
		options: { head: config.head },
		component: config.shellComponent || config.component,
	}),
}));import { Route } from "./__root";

type TestRoute = {
	component?: { name?: string };
	options?: {
		head?: () => {
			meta?: Array<Record<string, string>>;
			links?: Array<Record<string, string>>;
		};
	};
};

describe("/ (root) route", () => {
	const R = Route as TestRoute;

	it("renders RootDocument as shell component", () => {
		expect(R.component?.name).toBe("RootDocument");
	});

	it("sets head metadata with HermesHub title", () => {
		const head = R.options?.head?.();
		const meta = head?.meta ?? [];
		expect(meta).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ title: "HermesHub" }),
			]),
		);
	});

	it("sets viewport and charset meta", () => {
		const head = R.options?.head?.();
		const meta = head?.meta ?? [];
		expect(meta).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ charSet: "utf-8" }),
				expect.objectContaining({
					name: "viewport",
					content: "width=device-width, initial-scale=1",
				}),
			]),
		);
	});

	it("includes app CSS link in head", () => {
		const head = R.options?.head?.();
		const links = head?.links ?? [];
		expect(links).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ rel: "stylesheet" }),
			]),
		);
	});

	it("sets description meta", () => {
		const head = R.options?.head?.();
		const meta = head?.meta ?? [];
		expect(meta).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "description" }),
			]),
		);
	});
});
