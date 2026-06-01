// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LogsSnapshot } from "@/lib/logs";

import { LogsViewer } from "./logs-viewer";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	fetchMock.mockResolvedValue(
		new Response(JSON.stringify({ status: "cleared" }), {
			status: 200,
			headers: { "content-type": "application/json" },
		}),
	);
});

describe("LogsViewer", () => {
	it("renders install and action logs in read-only panels", () => {
		render(<LogsViewer initialLogs={createLogs()} />);

		expect(screen.getByRole("heading", { name: /install log/i })).toBeTruthy();
		expect(screen.getAllByText(/production vps/i)).toHaveLength(2);
		expect(screen.getByText(/action failed: host unreachable/i)).toBeTruthy();
	});

	it("confirms before clearing logs and then shows the empty state", async () => {
		render(<LogsViewer initialLogs={createLogs()} />);

		fireEvent.click(screen.getByRole("button", { name: /clear logs/i }));
		expect(screen.getByText(/clear displayed logs\?/i)).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /confirm clear/i }));

		await flushAsyncWork();

		expect(screen.getByText(/no logs yet/i)).toBeTruthy();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/logs/clear",
			expect.objectContaining({ method: "POST" }),
		);
	});
});

async function flushAsyncWork() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}

function createLogs(): LogsSnapshot {
	return {
		installLogs: [
			{
				id: "install_1",
				serverLabel: "Production VPS",
				status: "succeeded",
				step: "start-containers",
				createdAt: "2026-05-26T03:00:00.000Z",
				updatedAt: "2026-05-26T03:05:00.000Z",
				lines: ["2026-05-26T03:00:00.000Z [install-docker] Installing Docker"],
			},
		],
		actionLogs: [
			{
				id: "audit_1",
				serverLabel: "Production VPS",
				action: "restart",
				result: "failed",
				createdAt: "2026-05-26T04:00:00.000Z",
				message: "Action failed: host unreachable",
			},
		],
	};
}
