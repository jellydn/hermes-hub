// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import type { ComponentPropsWithoutRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", () => {
	const MockIcon = (props: Record<string, unknown>) => <svg {...props} />;
	return {
		LoaderCircle: MockIcon,
		RefreshCw: MockIcon,
		RotateCcw: MockIcon,
		ShieldAlert: MockIcon,
		Wrench: MockIcon,
	};
});

vi.mock("#/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		type = "button",
		...props
	}: ComponentPropsWithoutRef<"button">) => (
		<button type={type} disabled={disabled} onClick={onClick} {...props}>
			{children}
		</button>
	),
}));

import { ServerActionControls } from "./server-action-controls";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const updateInfoResponse = {
	current: {
		image:
			"nousresearch/hermes-agent@sha256:0df64d3f063ed22f9a0287d0f7a4c314ed9a504cbdefe55d6803b0d40761dcb9",
		imageId: "sha256:old",
		repoDigests: [],
	},
	latest: {
		tag: "latest",
		digest:
			"sha256:4c8aceb35c5b309ebeb0c3bafed52544aff3ff78005cbcfb744ddbaa8829d924",
		pushedAt: "2026-08-06T12:00:00.000Z",
	},
	release: {
		tagName: "v2026.8.3",
		name: "Hermes Agent v0.20.0 (2026.8.3)",
		publishedAt: "2026-08-03T10:00:00.000Z",
		body: "## Changes\n- Fixed critical bug\n- Added new feature",
		htmlUrl: "https://github.com/NousResearch/hermes-agent/releases/v2026.8.3",
	},
	updateAvailable: true,
};

function defaultProps(
	overrides?: Partial<ComponentPropsWithoutRef<typeof ServerActionControls>>,
) {
	return {
		activeAction: null as never,
		pendingAction: null,
		rollbackTarget: null,
		serverId: "server_123",
		onCancelDialog: vi.fn(),
		onConfirmAction: vi.fn(),
		onOpenDialog: vi.fn(),
		...overrides,
	};
}

async function flushAsyncWork() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}

describe("ServerActionControls", () => {
	beforeEach(() => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify(updateInfoResponse), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
	});

	it("renders action buttons", () => {
		render(<ServerActionControls {...defaultProps()} />);

		expect(
			screen.getByRole("button", { name: /restart hermes/i }),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: /update hermes/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /rollback/i })).toBeTruthy();
	});

	it("shows generic confirmation card for restart", () => {
		render(
			<ServerActionControls {...defaultProps({ activeAction: "restart" })} />,
		);

		expect(screen.getByText(/are you sure\?/i)).toBeTruthy();
		expect(screen.getByRole("button", { name: /^confirm$/i })).toBeTruthy();
	});

	it("fetches update-info and renders version + changelog for update", async () => {
		render(
			<ServerActionControls {...defaultProps({ activeAction: "update" })} />,
		);

		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/servers/server_123/hermes-update-info",
		);
		expect(screen.getByText(/an update is available/i)).toBeTruthy();
		expect(screen.getByText(/hermes agent v0\.20\.0/i)).toBeTruthy();
		expect(screen.getByText(/v2026\.8\.3/i)).toBeTruthy();
		expect(screen.getByText(/fixed critical bug/i)).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /confirm update/i }),
		).toBeTruthy();
	});

	it("disables confirm when up to date", async () => {
		fetchMock.mockResolvedValue(
			new Response(
				JSON.stringify({
					...updateInfoResponse,
					latest: {
						tag: "latest",
						digest:
							"sha256:0df64d3f063ed22f9a0287d0f7a4c314ed9a504cbdefe55d6803b0d40761dcb9",
						pushedAt: "2026-08-06T12:00:00.000Z",
					},
					updateAvailable: false,
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(
			<ServerActionControls {...defaultProps({ activeAction: "update" })} />,
		);

		await flushAsyncWork();

		expect(screen.getByText(/hermes is up to date/i)).toBeTruthy();
		expect(
			screen
				.getByRole("button", { name: /up to date/i })
				.getAttribute("disabled"),
		).toBe("");
	});

	it("sends versionTarget (latest digest) on confirm", async () => {
		const onConfirmAction = vi.fn();

		render(
			<ServerActionControls
				{...defaultProps({
					activeAction: "update",
					onConfirmAction,
				})}
			/>,
		);

		await flushAsyncWork();

		fireEvent.click(screen.getByRole("button", { name: /confirm update/i }));

		expect(onConfirmAction).toHaveBeenCalledWith(
			"update",
			"sha256:4c8aceb35c5b309ebeb0c3bafed52544aff3ff78005cbcfb744ddbaa8829d924",
		);
	});

	it("shows error card when update-info fetch fails", async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ error: "SSH failed" }), {
				status: 400,
				headers: { "content-type": "application/json" },
			}),
		);

		render(
			<ServerActionControls {...defaultProps({ activeAction: "update" })} />,
		);

		await flushAsyncWork();

		expect(screen.getByText(/ssh failed/i)).toBeTruthy();
		expect(screen.getByRole("button", { name: /update anyway/i })).toBeTruthy();
	});
});
