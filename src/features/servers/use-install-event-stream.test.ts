// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useInstallEventStream } from "./use-install-event-stream";

type InstallProgressEvent = {
	installId: string;
	serverId: string;
	step: string;
	progress: number;
	message: string;
	status: "running" | "succeeded" | "failed";
	timestamp: string;
};

let eventSourceInstances: Array<{
	url: string;
	onerror: (() => void) | null;
	closed: boolean;
	addEventListener: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
	emit: (event: InstallProgressEvent) => void;
}> = [];

class MockEventSource {
	url: string;
	onerror: (() => void) | null = null;
	closed = false;
	addEventListener = vi.fn(
		(type: string, listener: (messageEvent: MessageEvent<string>) => void) => {
			if (type === "install-progress") {
				this.progressListener = listener;
			}
		},
	);
	close = vi.fn(() => {
		this.closed = true;
	});
	private progressListener:
		| ((messageEvent: MessageEvent<string>) => void)
		| null = null;

	constructor(url: string) {
		this.url = url;
		const instance = {
			url: this.url,
			onerror: this.onerror,
			closed: this.closed,
			addEventListener: this.addEventListener,
			close: this.close,
			emit: (event: InstallProgressEvent) => {
				this.progressListener?.({
					data: JSON.stringify(event),
				} as MessageEvent<string>);
			},
		};

		Object.defineProperty(instance, "onerror", {
			get: () => this.onerror,
			set: (handler: (() => void) | null) => {
				this.onerror = handler;
			},
		});

		eventSourceInstances.push(instance);
	}

	emit(event: InstallProgressEvent) {
		this.progressListener?.({
			data: JSON.stringify(event),
		} as MessageEvent<string>);
	}
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	eventSourceInstances = [];
});

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("EventSource", MockEventSource);
});

describe("useInstallEventStream", () => {
	it("opens an install SSE stream for the server on mount", () => {
		renderHook(() => useInstallEventStream("server_123"));

		expect(eventSourceInstances).toHaveLength(1);
		expect(eventSourceInstances[0]?.url).toBe(
			"/api/servers/server_123/install/events",
		);
	});

	it("schedules reconnect after a stream error while install is running", () => {
		vi.useFakeTimers();

		const { result } = renderHook(() => useInstallEventStream("server_123"));
		const stream = eventSourceInstances[0];

		act(() => {
			stream?.onerror?.();
		});

		expect(result.current.connectionState).toBe("reconnecting");
		expect(eventSourceInstances).toHaveLength(1);

		act(() => {
			vi.advanceTimersByTime(1000);
		});

		expect(eventSourceInstances).toHaveLength(2);
	});

	it("does not reconnect after stream errors once install is terminal", () => {
		vi.useFakeTimers();

		const { result } = renderHook(() => useInstallEventStream("server_123"));
		const stream = eventSourceInstances[0];

		act(() => {
			stream?.emit({
				installId: "install_123",
				serverId: "server_123",
				step: "complete",
				progress: 100,
				message: "Install complete",
				status: "succeeded",
				timestamp: "2026-06-06T12:00:00.000Z",
			});
		});

		expect(result.current.connectionState).toBe("closed");

		act(() => {
			stream?.onerror?.();
			vi.advanceTimersByTime(5000);
		});

		expect(eventSourceInstances).toHaveLength(1);
		expect(result.current.connectionState).toBe("closed");
	});

	it("cleans up the active stream and reconnect timer on unmount", () => {
		vi.useFakeTimers();

		const { unmount } = renderHook(() => useInstallEventStream("server_123"));
		const stream = eventSourceInstances[0];

		act(() => {
			stream?.onerror?.();
		});

		unmount();

		act(() => {
			vi.advanceTimersByTime(5000);
		});

		expect(stream?.close).toHaveBeenCalled();
		expect(eventSourceInstances).toHaveLength(1);
	});
});
