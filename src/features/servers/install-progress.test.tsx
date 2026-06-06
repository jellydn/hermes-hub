import { describe, expect, it } from "vitest";

import {
	type InstallEvent,
	mergeInstallSnapshot,
	quantizeInstallProgress,
} from "./install-snapshot";

describe("install progress helpers", () => {
	it("deduplicates replayed SSE events while preserving the latest status", () => {
		const event: InstallEvent = {
			installId: "install_123",
			serverId: "server_123",
			step: "install-docker",
			progress: 15,
			message: "Installing Docker",
			status: "running",
			timestamp: "2026-05-26T02:00:00.000Z",
		};

		const snapshot = mergeInstallSnapshot(
			mergeInstallSnapshot(
				{ events: [], status: "pending", error: null },
				event,
			),
			event,
		);

		expect(snapshot.events).toHaveLength(1);
		expect(snapshot.status).toBe("running");
	});

	it("rounds backend percentages into quarter-step UI progress", () => {
		expect(quantizeInstallProgress(0)).toBe(0);
		expect(quantizeInstallProgress(15)).toBe(25);
		expect(quantizeInstallProgress(30)).toBe(50);
		expect(quantizeInstallProgress(60)).toBe(75);
		expect(quantizeInstallProgress(80)).toBe(100);
	});
});
