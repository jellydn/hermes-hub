// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ServerListSummary } from "@/lib/servers";

type MockLinkProps = {
	children?: ReactNode;
	params?: Record<string, string>;
	to: string;
} & Omit<ComponentPropsWithoutRef<"a">, "href">;

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, params, to, ...props }: MockLinkProps) => (
		<a href={resolveTo(to, params)} {...props}>
			{children}
		</a>
	),
}));

vi.mock("lucide-react", () => {
	const MockIcon = (props: Record<string, unknown>) => <svg {...props} />;
	return {
		ArrowRight: MockIcon,
		Plus: MockIcon,
		Rocket: MockIcon,
		Server: MockIcon,
	};
});

import { ServerList } from "./server-list";

describe("ServerList", () => {
	it("renders the empty state with a new server CTA", () => {
		render(<ServerList servers={[]} />);

		expect(
			screen.getByRole("heading", { name: /add your first server/i }),
		).toBeTruthy();
		expect(
			screen
				.getByRole("link", { name: /add your first server/i })
				.getAttribute("href"),
		).toBe("/servers/new");
	});

	it("renders server cards with manage and install links", () => {
		render(<ServerList servers={[createServer()]} />);

		expect(
			screen.getByRole("heading", { name: /production vps/i }),
		).toBeTruthy();
		expect(screen.getByText(/succeeded/i)).toBeTruthy();
		expect(screen.getByText(/ubuntu 24.04/i)).toBeTruthy();
		expect(
			screen.getByRole("link", { name: /manage server/i }).getAttribute("href"),
		).toBe("/servers/server_123");
		expect(
			screen.getByRole("link", { name: /^install$/i }).getAttribute("href"),
		).toBe("/servers/server_123/install");
	});
});

function createServer(
	overrides?: Partial<ServerListSummary>,
): ServerListSummary {
	return {
		id: "server_123",
		label: "Production VPS",
		host: "203.0.113.10",
		status: "connected",
		osName: "Ubuntu",
		osVersion: "24.04",
		supportLevel: "supported",
		installStatus: "succeeded",
		installUpdatedAt: "2026-05-26T04:00:00.000Z",
		lastActionAt: "2026-05-26T05:00:00.000Z",
		lastActivityAt: "2026-05-26T05:00:00.000Z",
		...overrides,
	};
}

function resolveTo(to: string, params?: Record<string, string>) {
	if (!params) {
		return to;
	}

	return Object.entries(params).reduce(
		(path, [key, value]) => path.replace(`$${key}`, value),
		to,
	);
}
