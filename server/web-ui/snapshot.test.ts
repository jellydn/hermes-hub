import { afterEach, describe, expect, it, vi } from "vitest";

import { buildWebUiSnapshot, isStaleDeploy } from "./snapshot";

afterEach(() => {
	vi.useRealTimers();
});

describe("isStaleDeploy", () => {
	it("returns true when deployStartedAt is null (legacy row)", () => {
		expect(isStaleDeploy(null)).toBe(true);
	});

	it("returns false when deploy started recently (within threshold)", () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const startedAt = new Date(now.getTime() - 9 * 60 * 1000); // 9 minutes ago
		expect(isStaleDeploy(startedAt)).toBe(false);
	});

	it("returns true when deploy started longer than the threshold", () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const startedAt = new Date(now.getTime() - 11 * 60 * 1000); // 11 minutes ago
		expect(isStaleDeploy(startedAt)).toBe(true);
	});

	it("returns false exactly at the threshold boundary", () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const startedAt = new Date(now.getTime() - 10 * 60 * 1000); // exactly 10 minutes ago
		expect(isStaleDeploy(startedAt)).toBe(false);
	});
});

describe("buildWebUiSnapshot stale detection", () => {
	it("marks stale deploying record as failed with timeout message", () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const startedAt = new Date(now.getTime() - 20 * 60 * 1000); // 20 minutes ago
		const snapshot = buildWebUiSnapshot("server_123", {
			enabled: false,
			encryptedPassword: null,
			port: 8787,
			deployStatus: "deploying",
			deployError: null,
			deployStartedAt: startedAt,
			updatedAt: new Date("2026-06-06T11:40:00.000Z"),
		});

		expect(snapshot.deployStatus).toBe("failed");
		expect(snapshot.deployError).toBe(
			"Web UI deploy timed out. The HermesHub process may have restarted during setup.",
		);
	});

	it("does not mark non-deploying records as stale even with old startedAt", () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const startedAt = new Date(now.getTime() - 20 * 60 * 1000); // 20 minutes ago
		const snapshot = buildWebUiSnapshot("server_123", {
			enabled: true,
			encryptedPassword: null,
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: startedAt,
			updatedAt: new Date("2026-06-06T11:40:00.000Z"),
		});

		expect(snapshot.deployStatus).toBe("succeeded");
		expect(snapshot.deployError).toBe(null);
		expect(snapshot.deployStartedAt).toBe(startedAt.toISOString());
	});

	it("preserves original deployError on non-stale deploying records", () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const startedAt = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago (within threshold)
		const snapshot = buildWebUiSnapshot("server_123", {
			enabled: false,
			encryptedPassword: null,
			port: 8787,
			deployStatus: "deploying",
			deployError: "Transient DNS failure",
			deployStartedAt: startedAt,
			updatedAt: new Date("2026-06-06T11:55:00.000Z"),
		});

		expect(snapshot.deployStatus).toBe("deploying");
		expect(snapshot.deployError).toBe("Transient DNS failure");
	});

	it("reports deployingStartedAt as null when the record has no started timestamp", () => {
		const snapshot = buildWebUiSnapshot("server_123", {
			enabled: false,
			encryptedPassword: null,
			port: 8787,
			deployStatus: "idle",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-06-06T12:00:00.000Z"),
		});

		expect(snapshot.deployStartedAt).toBe(null);
	});

	it("marks deploying with null deployStartedAt as stale (legacy row)", () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const snapshot = buildWebUiSnapshot("server_123", {
			enabled: false,
			encryptedPassword: null,
			port: 8787,
			deployStatus: "deploying",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-06-06T12:00:00.000Z"),
		});

		expect(snapshot.deployStatus).toBe("failed");
		expect(snapshot.deployError).toBe(
			"Web UI deploy timed out. The HermesHub process may have restarted during setup.",
		);
	});
});

describe("buildWebUiSnapshot", () => {
	it("returns deploying state for in-progress deploys", () => {
		const deployStartedAt = new Date();
		const snapshot = buildWebUiSnapshot("server_123", {
			enabled: false,
			encryptedPassword: null,
			port: 8787,
			deployStatus: "deploying",
			deployError: null,
			deployStartedAt,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		expect(snapshot).toEqual({
			enabled: false,
			port: 8787,
			proxyPath: "/api/servers/server_123/web-ui/proxy/",
			deployStatus: "deploying",
			deployError: null,
			deployStartedAt: deployStartedAt.toISOString(),
			updatedAt: "2026-05-26T04:00:00.000Z",
		});
	});

	it("returns failed state with deploy error", () => {
		const snapshot = buildWebUiSnapshot("server_123", {
			enabled: false,
			encryptedPassword: null,
			port: 8787,
			deployStatus: "failed",
			deployError: "Connection refused",
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		expect(snapshot.deployStatus).toBe("failed");
		expect(snapshot.deployError).toBe("Connection refused");
	});

	it("returns succeeded state for enabled Web UI", () => {
		const snapshot = buildWebUiSnapshot("server_123", {
			enabled: true,
			encryptedPassword: "enc:password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		expect(snapshot.enabled).toBe(true);
		expect(snapshot.deployStatus).toBe("succeeded");
	});
});
