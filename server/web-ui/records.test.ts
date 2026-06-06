import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	insertValues,
	onConflictDoUpdate,
	updateReturning,
	updateWhere,
	updateSet,
	selectLimit,
} = vi.hoisted(() => ({
	insertValues: vi.fn(),
	onConflictDoUpdate: vi.fn(),
	updateReturning: vi.fn(),
	updateWhere: vi.fn(),
	updateSet: vi.fn(),
	selectLimit: vi.fn(),
}));

vi.mock("../db", () => ({
	getDb: () => ({
		insert: () => ({
			values: insertValues,
		}),
		update: () => ({
			set: updateSet,
		}),
		select: () => ({
			from: () => ({
				where: () => ({
					limit: selectLimit,
				}),
			}),
		}),
	}),
}));

vi.mock("../db/schema", () => ({
	serverWebUi: {
		serverId: Symbol("serverWebUi.serverId"),
		deployStatus: Symbol("serverWebUi.deployStatus"),
		deployStartedAt: Symbol("serverWebUi.deployStartedAt"),
		enabled: Symbol("serverWebUi.enabled"),
		encryptedPassword: Symbol("serverWebUi.encryptedPassword"),
		port: Symbol("serverWebUi.port"),
		deployError: Symbol("serverWebUi.deployError"),
		updatedAt: Symbol("serverWebUi.updatedAt"),
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
		updateSet.mockReturnValue({ where: updateWhere });
		updateWhere.mockReturnValue({ returning: updateReturning });
	});

	it("persists stale deploying records as failed", async () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const startedAt = new Date(now.getTime() - 20 * 60 * 1000);
		const updatedAt = new Date();
		updateReturning.mockResolvedValue([
			{
				enabled: false,
				encryptedPassword: null,
				port: 8787,
				deployStatus: "failed",
				deployError: STALE_DEPLOY_ERROR,
				deployStartedAt: null,
				updatedAt,
			},
		]);

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
		expect(updateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				deployStatus: "failed",
				deployError: STALE_DEPLOY_ERROR,
				deployStartedAt: null,
			}),
		);
		expect(updateReturning).toHaveBeenCalled();
	});

	it("persists legacy deploying rows with null deployStartedAt as failed", async () => {
		const updatedAt = new Date();
		updateReturning.mockResolvedValue([
			{
				enabled: false,
				encryptedPassword: null,
				port: 8787,
				deployStatus: "failed",
				deployError: STALE_DEPLOY_ERROR,
				deployStartedAt: null,
				updatedAt,
			},
		]);

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
		expect(updateReturning).not.toHaveBeenCalled();
	});

	it("re-fetches when compare-and-set misses a newer deploy result", async () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const startedAt = new Date(now.getTime() - 20 * 60 * 1000);
		const freshRecord = {
			enabled: true,
			encryptedPassword: "encrypted",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-06-06T11:59:00.000Z"),
		};

		updateReturning.mockResolvedValue([]);
		selectLimit.mockResolvedValue([freshRecord]);

		const resolved = await resolveServerWebUiRecord("server_123", {
			enabled: false,
			encryptedPassword: null,
			port: 8787,
			deployStatus: "deploying",
			deployError: null,
			deployStartedAt: startedAt,
			updatedAt: new Date("2026-06-06T11:40:00.000Z"),
		});

		expect(resolved).toEqual(freshRecord);
		expect(selectLimit).toHaveBeenCalled();
	});
});
