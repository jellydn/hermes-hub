// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import type { ComponentPropsWithoutRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DashboardStatusSnapshot } from "@/lib/dashboard-status";

vi.mock("lucide-react", () => {
	const MockIcon = (props: Record<string, unknown>) => <svg {...props} />;
	return {
		Activity: MockIcon,
		Bot: MockIcon,
		Cpu: MockIcon,
		LoaderCircle: MockIcon,
		RefreshCcw: MockIcon,
		Server: MockIcon,
		Sparkles: MockIcon,
		TriangleAlert: MockIcon,
		CheckCircle2: MockIcon,
		AlertCircle: MockIcon,
		Info: MockIcon,
		Circle: MockIcon,
	};
});

vi.mock("@/components/ui/button", () => ({
	Button: ({
		asChild: _asChild,
		children,
		disabled,
		onClick,
		type = "button",
		...props
	}: ComponentPropsWithoutRef<"button"> & { asChild?: boolean }) => (
		<button type={type} disabled={disabled} onClick={onClick} {...props}>
			{children}
		</button>
	),
}));

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

		await flushAsyncWork();

		expect(screen.getAllByText(/unable to load/i)).toHaveLength(5);

		expect(screen.getAllByRole("button", { name: /retry/i })).toHaveLength(5);
	});

	it("backs off polling after failures and resets to 30 seconds after success", async () => {
		vi.useFakeTimers();
		fetchMock
			.mockResolvedValueOnce(createErrorResponse("Temporary outage"))
			.mockResolvedValueOnce(createStatusResponse(createSnapshot()))
			.mockResolvedValueOnce(createStatusResponse(createSnapshot()));

		render(<DashboardStatusOverview initialStatus={createSnapshot()} />);

		expect(fetchMock).toHaveBeenCalledTimes(0);

		await advancePollingTime(30_000);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(
			screen.getByText(/latest refresh failed, so these cards may be stale/i),
		).toBeTruthy();

		await advancePollingTime(59_000);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		await advancePollingTime(1_000);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(
			screen.queryByText(/latest refresh failed, so these cards may be stale/i),
		).toBeNull();

		await advancePollingTime(29_000);
		expect(fetchMock).toHaveBeenCalledTimes(2);

		await advancePollingTime(1_000);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("stops polling after three failures and resumes after manual retry", async () => {
		vi.useFakeTimers();
		fetchMock
			.mockResolvedValueOnce(createErrorResponse("Failure one"))
			.mockResolvedValueOnce(createErrorResponse("Failure two"))
			.mockResolvedValueOnce(createErrorResponse("Failure three"))
			.mockResolvedValueOnce(createStatusResponse(createSnapshot()))
			.mockResolvedValueOnce(createStatusResponse(createSnapshot()));

		render(<DashboardStatusOverview initialStatus={createSnapshot()} />);

		await advancePollingTime(30_000);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		await advancePollingTime(60_000);
		expect(fetchMock).toHaveBeenCalledTimes(2);

		await advancePollingTime(120_000);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(screen.getByText(/connection lost/i)).toBeTruthy();

		await advancePollingTime(5 * 60_000);
		expect(fetchMock).toHaveBeenCalledTimes(3);

		fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));
		await flushAsyncWork();
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(screen.queryByText(/connection lost/i)).toBeNull();

		await advancePollingTime(30_000);
		expect(fetchMock).toHaveBeenCalledTimes(5);
	});
});

async function advancePollingTime(ms: number) {
	await act(async () => {
		vi.advanceTimersByTime(ms);
		await Promise.resolve();
		await Promise.resolve();
	});
}

async function flushAsyncWork() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}

function createStatusResponse(snapshot: DashboardStatusSnapshot) {
	return new Response(JSON.stringify({ dashboard: snapshot }), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

function createErrorResponse(error: string) {
	return new Response(JSON.stringify({ error }), {
		status: 502,
		headers: { "content-type": "application/json" },
	});
}

function createSnapshot(
	overrides?: Partial<DashboardStatusSnapshot>,
): DashboardStatusSnapshot {
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
		serverCount: 1,
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
		...overrides,
	};
}
