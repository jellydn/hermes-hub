// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerDetailSnapshot } from "@/lib/server-detail";

type MockLinkProps = {
	children?: ReactNode;
	to: string;
} & Omit<ComponentPropsWithoutRef<"a">, "href">;

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to, ...props }: MockLinkProps) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

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
		render(
			<ServerDetail
				detail={createDetail()}
				onDetailChange={vi.fn()}
				onGoToInstall={vi.fn()}
			/>,
		);

		expect(screen.getAllByText(/restart agent/i).length).toBeGreaterThanOrEqual(
			1,
		);
		expect(
			screen.getByText(/updated hermes to the latest image successfully/i),
		).toBeTruthy();
		expect(screen.getByText(/action failed: host unreachable/i)).toBeTruthy();
	});

	it("requires confirmation before running a server action", async () => {
		render(
			<ServerDetail
				detail={createDetail()}
				onDetailChange={vi.fn()}
				onGoToInstall={vi.fn()}
			/>,
		);

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

		render(
			<ServerDetail
				detail={createDetail()}
				onDetailChange={vi.fn()}
				onGoToInstall={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /update hermes/i }));
		fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

		await waitFor(() => {
			expect(screen.getByText(/action failed: host unreachable/i)).toBeTruthy();
		});
	});

	it("updates server basics from the readonly fields", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					serverDetail: createDetail({
						server: { label: "Primary VPS" },
					}),
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const handleDetailChange = vi.fn();
		render(
			<ServerDetail
				detail={createDetail()}
				onDetailChange={handleDetailChange}
				onGoToInstall={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /edit server label/i }));
		fireEvent.change(screen.getByLabelText(/server label/i), {
			target: { value: "Primary VPS" },
		});
		fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

		await waitFor(() => {
			expect(screen.getByText(/server basics updated/i)).toBeTruthy();
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/servers/server_123",
			expect.objectContaining({ method: "PATCH" }),
		);
		expect(handleDetailChange).toHaveBeenCalledWith(
			expect.objectContaining({
				server: expect.objectContaining({ label: "Primary VPS" }),
			}),
		);
	});

	it("opens the install flow from manage server", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ install: { id: "install_123" } }), {
				status: 202,
				headers: { "content-type": "application/json" },
			}),
		);

		const handleGoToInstall = vi.fn();
		render(
			<ServerDetail
				detail={createDetail({ install: null })}
				onDetailChange={vi.fn()}
				onGoToInstall={handleGoToInstall}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /install hermes/i }));

		await waitFor(() => {
			expect(handleGoToInstall).toHaveBeenCalledWith("server_123");
		});
	});

	it("retries a failed install from manage server", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ install: { id: "install_123" } }), {
				status: 202,
				headers: { "content-type": "application/json" },
			}),
		);

		const handleGoToInstall = vi.fn();
		render(
			<ServerDetail
				detail={createDetail({
					install: {
						status: "failed",
						version: "latest",
						updatedAt: "2026-05-26T03:00:00.000Z",
					},
				})}
				onDetailChange={vi.fn()}
				onGoToInstall={handleGoToInstall}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /retry install/i }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/servers/server_123/install",
				expect.objectContaining({ method: "POST" }),
			);
			expect(handleGoToInstall).toHaveBeenCalledWith("server_123");
		});
	});
});

function createDetail(overrides?: {
	server?: Partial<ServerDetailSnapshot["server"]>;
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
			...overrides?.server,
		},
		install:
			overrides && "install" in overrides
				? (overrides.install ?? null)
				: {
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
