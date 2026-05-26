// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerDetailSnapshot } from "@/lib/server-detail";

import { ServerDetail } from "./server-detail";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	fetchMock.mockResolvedValue(
		new Response(
			JSON.stringify({
				status: "succeeded",
				action: "restart",
				message: "Restarted Hermes successfully.",
			}),
			{
				status: 200,
				headers: { "content-type": "application/json" },
			},
		),
	);
});

describe("ServerDetail", () => {
	it("renders the last five action results", () => {
		render(<ServerDetail initialDetail={createDetail()} />);

		expect(screen.getAllByText(/restart agent/i).length).toBeGreaterThanOrEqual(
			1,
		);
		expect(
			screen.getByText(/updated hermes to the latest image successfully/i),
		).toBeTruthy();
		expect(screen.getByText(/action failed: host unreachable/i)).toBeTruthy();
	});

	it("requires confirmation before running a server action", async () => {
		render(<ServerDetail initialDetail={createDetail()} />);

		fireEvent.click(screen.getByRole("button", { name: /restart agent/i }));

		expect(screen.getByText(/are you sure\?/i)).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

		await waitFor(() => {
			expect(
				screen.getAllByText(/restarted hermes successfully/i).length,
			).toBeGreaterThanOrEqual(1);
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/servers/server_123/actions",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("shows a failed action message when the API returns an error", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ error: "Action failed: host unreachable" }),
				{
					status: 400,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(<ServerDetail initialDetail={createDetail()} />);

		fireEvent.click(screen.getByRole("button", { name: /update hermes/i }));
		fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

		await waitFor(() => {
			expect(screen.getByText(/action failed: host unreachable/i)).toBeTruthy();
		});
	});
});

function createDetail(): ServerDetailSnapshot {
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
		},
		install: {
			status: "succeeded",
			version: "latest",
			updatedAt: "2026-05-26T03:00:00.000Z",
		},
		actionHistory: [
			{
				id: "audit_2",
				action: "update",
				result: "succeeded",
				createdAt: "2026-05-26T03:10:00.000Z",
				message: "Updated Hermes to the latest image successfully.",
				imageRef: null,
			},
			{
				id: "audit_1",
				action: "restart",
				result: "failed",
				createdAt: "2026-05-26T03:05:00.000Z",
				message: "Action failed: host unreachable",
				imageRef: null,
			},
		],
		rollbackTarget: "latest",
	};
}
