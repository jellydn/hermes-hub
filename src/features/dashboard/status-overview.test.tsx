// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DashboardStatusSnapshot } from "@/lib/dashboard-status";

import { DashboardStatusOverview } from "./status-overview";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.useRealTimers();
});

describe("DashboardStatusOverview", () => {
	it("renders the dashboard cards from the initial snapshot", () => {
		render(<DashboardStatusOverview initialStatus={createSnapshot()} />);

		expect(screen.getByRole("heading", { name: /^online$/i })).toBeTruthy();
		expect(screen.getByText(/85%/i)).toBeTruthy();
		expect(screen.getByRole("heading", { name: /^openai$/i })).toBeTruthy();
		expect(
			screen.getByRole("heading", { name: /^@hermes_helper_bot$/i }),
		).toBeTruthy();
	});

	it("shows retryable error cards when the initial fetch fails", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Network down" }), {
				status: 502,
				headers: { "content-type": "application/json" },
			}),
		);

		render(<DashboardStatusOverview initialStatus={null} />);

		await waitFor(() => {
			expect(screen.getAllByText(/unable to load/i)).toHaveLength(4);
		});

		expect(screen.getAllByRole("button", { name: /retry/i })).toHaveLength(4);
	});
});

function createSnapshot(): DashboardStatusSnapshot {
	return {
		generatedAt: "2026-05-26T03:00:00.000Z",
		server: {
			id: "server_123",
			label: "Production VPS",
			host: "203.0.113.10",
			status: "connected",
			osName: "Ubuntu",
			osVersion: "24.04",
			supportLevel: "supported",
		},
		agent: {
			status: "online",
			updatedAt: "2026-05-26T03:00:00.000Z",
			detail: "Hermes finished installing successfully on the connected VPS.",
		},
		vps: {
			status: "warning",
			updatedAt: "2026-05-26T03:00:00.000Z",
			cpu: 85,
			memory: 62,
			disk: 44,
			uptime: "up 2 hours",
			detail: "One or more VPS resources are running hot.",
			error: null,
		},
		provider: {
			status: "connected",
			provider: "openai",
			model: "gpt-4o-mini",
			detail: "OpenAI is ready to power Hermes responses.",
		},
		telegram: {
			status: "connected",
			botUsername: "hermes_helper_bot",
			detail: "@hermes_helper_bot is ready for chat delivery.",
		},
	};
}
