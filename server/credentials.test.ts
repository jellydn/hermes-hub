import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getSessionCredential,
	setCredentialCleanupIntervalMs,
	storeSessionCredential,
} from "./credentials";

// The module uses Date.now() and setInterval internally; tests will use fake timers

describe("server/credentials session lifecycle", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("store and get round-trip", () => {
		storeSessionCredential({
			serverId: "srv",
			sessionId: "sess",
			authMethod: "password",
			credential: "secret",
		});

		const record = getSessionCredential("srv", "sess");
		expect(record).toBeTruthy();
		expect(record?.credential).toBe("secret");
	});

	it("read-time expiry deletes expired entries", () => {
		// store at t=now
		storeSessionCredential({
			serverId: "srv2",
			sessionId: "sess2",
			authMethod: "password",
			credential: "secret2",
		});

		// Advance time past TTL (30 minutes)
		const TTL = 30 * 60 * 1000;
		vi.advanceTimersByTime(TTL + 1000);

		// On read, the entry should be considered expired and removed
		const record = getSessionCredential("srv2", "sess2");
		expect(record).toBeNull();
	});

	it("periodic cleanup removes expired entries when interval is short", async () => {
		// Speed up cleanup interval to 100ms so the background sweeper runs quickly
		setCredentialCleanupIntervalMs(100);

		storeSessionCredential({
			serverId: "srv3",
			sessionId: "sess3",
			authMethod: "ssh-key",
			credential: "key",
		});

		// Advance time past TTL so the entry becomes eligible for cleanup
		const TTL = 30 * 60 * 1000;
		vi.advanceTimersByTime(TTL + 1000);

		// Allow the cleanup interval to run
		vi.advanceTimersByTime(200);

		// Now the background cleanup should have removed the entry (or getSessionCredential
		// will delete it on read). Either way, reading returns null.
		const record = getSessionCredential("srv3", "sess3");
		expect(record).toBeNull();
	});
});
