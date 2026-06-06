import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertValues, onConflictDoUpdate } = vi.hoisted(() => ({
	insertValues: vi.fn(),
	onConflictDoUpdate: vi.fn(),
}));

vi.mock("../db", () => ({
	getDb: () => ({
		insert: () => ({
			values: insertValues,
		}),
	}),
}));

vi.mock("../db/schema", () => ({
	serverWebUi: {
		serverId: Symbol("serverWebUi.serverId"),
	},
}));

import { resolveServerWebUiRecord, upsertServerWebUiRecord } from "./records";
import { STALE_DEPLOY_ERROR } from "./stale-deploy";

describe("upsertServerWebUiRecord", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		insertValues.mockReturnValue({ onConflictDoUpdate });
		onConflictDoUpdate.mockResolvedValue(undefined);
	});

	it("writes deploy status fields on conflict", async () => {
		const { getDb } = await import("../db");

		await upsertServerWebUiRecord(getDb(), {
			serverId: "server_123",
			deployStatus: "failed",
			deployError: "SSH timeout",
			deployStartedAt: null,
		});

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				serverId: "server_123",
				deployStatus: "failed",
				deployError: "SSH timeout",
				deployStartedAt: null,
			}),
		);
		expect(onConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				set: expect.objectContaining({
					deployStatus: "failed",
					deployError: "SSH timeout",
					deployStartedAt: null,
				}),
			}),
		);
	});
});

describe("resolveServerWebUiRecord", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		insertValues.mockReturnValue({ onConflictDoUpdate });
		onConflictDoUpdate.mockResolvedValue(undefined);
	});

	it("persists stale deploying records as failed", async () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const startedAt = new Date(now.getTime() - 20 * 60 * 1000);
		const resolved = await resolveServerWebUiRecord("server_123", {
			enabled: false,
			encryptedPassword: null,
			port: 8787,
			deployStatus: "deploying",
			deployError: null,
			deployStartedAt: startedAt,
			updatedAt: new Date("2026-06-06T11:40:00.000Z"),
		});

		expect(resolved?.deployStatus).toBe("failed");
		expect(resolved?.deployError).toBe(STALE_DEPLOY_ERROR);
		expect(resolved?.deployStartedAt).toBe(null);
		expect(onConflictDoUpdate).toHaveBeenCalled();
	});

	it("persists legacy deploying rows with null deployStartedAt as failed", async () => {
		const resolved = await resolveServerWebUiRecord("server_123", {
			enabled: false,
			encryptedPassword: null,
			port: 8787,
			deployStatus: "deploying",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-06-06T12:00:00.000Z"),
		});

		expect(resolved?.deployStatus).toBe("failed");
		expect(resolved?.deployError).toBe(STALE_DEPLOY_ERROR);
	});

	it("returns active deploying records unchanged", async () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const startedAt = new Date(now.getTime() - 5 * 60 * 1000);
		const record = {
			enabled: false,
			encryptedPassword: null,
			port: 8787,
			deployStatus: "deploying",
			deployError: "Transient DNS failure",
			deployStartedAt: startedAt,
			updatedAt: new Date("2026-06-06T11:55:00.000Z"),
		};

		const resolved = await resolveServerWebUiRecord("server_123", record);

		expect(resolved).toEqual(record);
		expect(onConflictDoUpdate).not.toHaveBeenCalled();
	});
});
