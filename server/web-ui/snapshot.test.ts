import { describe, expect, it } from "vitest";

import { buildWebUiSnapshot } from "./snapshot";

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
			landingPath: "/api/servers/server_123/web-ui/proxy/chat",
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

	it("reports deployStartedAt as null when the record has no started timestamp", () => {
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
});
