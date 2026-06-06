// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { type ComponentPropsWithoutRef, isValidElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hermesCommunitySiteUrl } from "@/lib/hermes-community";
import type { ServerDetailSnapshot } from "@/lib/server-detail";

vi.mock("lucide-react", () => {
	const MockIcon = (props: Record<string, unknown>) => <svg {...props} />;
	return {
		ExternalLink: MockIcon,
		Monitor: MockIcon,
		Rocket: MockIcon,
		LoaderCircle: MockIcon,
		Eye: MockIcon,
		EyeOff: MockIcon,
	};
});

vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		asChild,
		...props
	}: ComponentPropsWithoutRef<"button"> & { asChild?: boolean }) => {
		if (asChild && isValidElement(children)) {
			return children;
		}

		return (
			<button type="button" {...props}>
				{children}
			</button>
		);
	},
}));

import { ServerDetailAside } from "./server-detail-aside";

afterEach(() => {
	cleanup();
});

describe("ServerDetailAside", () => {
	it("shows the Hermes Web UI card after a successful install", () => {
		render(<ServerDetailAside detail={createDetail()} />);

		expect(screen.getByTestId("hermes-web-ui-card")).toBeTruthy();
	});

	it("hides the Hermes Web UI card before install", () => {
		render(<ServerDetailAside detail={createDetail({ install: null })} />);

		expect(screen.queryByTestId("hermes-web-ui-card")).toBeNull();
	});

	it("hides the Hermes Web UI card after a failed install", () => {
		render(
			<ServerDetailAside
				detail={createDetail({
					install: {
						status: "failed",
						version: "latest",
						updatedAt: "2026-05-26T03:00:00.000Z",
					},
				})}
			/>,
		);

		expect(screen.queryByTestId("hermes-web-ui-card")).toBeNull();
	});

	it("points Hermes Web UI links at get-hermes.ai", () => {
		render(<ServerDetailAside detail={createDetail()} />);

		const communityLinks = screen
			.getAllByRole("link")
			.filter((link) => link.getAttribute("href") === hermesCommunitySiteUrl);

		expect(communityLinks.length).toBeGreaterThanOrEqual(1);
	});
});

function createDetail(overrides?: {
	install?: ServerDetailSnapshot["install"];
}): ServerDetailSnapshot {
	return {
		server: {
			id: "server_123",
			label: "Production VPS",
			host: "203.0.113.10",
			port: 22,
			username: "root",
			authMethod: "password",
			status: "connected",
			osName: "Ubuntu",
			osVersion: "24.04",
			architecture: "x86_64",
			supportLevel: "supported",
		},
		install:
			overrides && "install" in overrides
				? (overrides.install ?? null)
				: {
						status: "succeeded",
						version: "latest",
						updatedAt: "2026-05-26T03:00:00.000Z",
					},
		actionHistory: [],
		rollbackTarget: "latest",
		webUi: null,
	};
}
