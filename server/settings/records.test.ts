import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	insertValues,
	onConflictDoUpdate,
	selectLimit,
} = vi.hoisted(() => ({
	insertValues: vi.fn(),
	onConflictDoUpdate: vi.fn(),
	selectLimit: vi.fn(),
}));

vi.mock("../db", () => ({
	getDb: () => ({
		insert: () => ({
			values: insertValues,
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
	hermesSettings: {
		userId: Symbol("hermesSettings.userId"),
		agentPersona: Symbol("hermesSettings.agentPersona"),
		deployedServerId: Symbol("hermesSettings.deployedServerId"),
		deployedServerHost: Symbol("hermesSettings.deployedServerHost"),
		deployedAt: Symbol("hermesSettings.deployedAt"),
		updatedAt: Symbol("hermesSettings.updatedAt"),
	},
}));

import {
	getCurrentPersonaSettings,
	getHermesSettingsRecord,
	upsertHermesSettingsRecord,
} from "./records";

describe("getHermesSettingsRecord", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns null when no record exists for user", async () => {
		selectLimit.mockResolvedValue([]);

		const result = await getHermesSettingsRecord("user_123");

		expect(result).toBeNull();
		expect(selectLimit).toHaveBeenCalledWith(1);
	});

	it("returns the record when one exists", async () => {
		const record = {
			agentPersona: "You are Hermes.",
			deployedServerId: "server_1",
			deployedServerHost: "1.2.3.4",
			deployedAt: new Date("2026-06-06T12:00:00.000Z"),
			updatedAt: new Date("2026-06-06T12:00:00.000Z"),
		};
		selectLimit.mockResolvedValue([record]);

		const result = await getHermesSettingsRecord("user_123");

		expect(result).toEqual(record);
	});

	it("returns only the first record when multiple exist (limit 1)", async () => {
		const first = {
			agentPersona: "First persona",
			deployedServerId: null,
			deployedServerHost: null,
			deployedAt: null,
			updatedAt: new Date("2026-06-06T11:00:00.000Z"),
		};
		selectLimit.mockResolvedValue([first]);

		const result = await getHermesSettingsRecord("user_456");

		expect(result).toEqual(first);
		expect(selectLimit).toHaveBeenCalledWith(1);
	});
});

describe("getCurrentPersonaSettings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns null when no record exists", async () => {
		selectLimit.mockResolvedValue([]);

		const result = await getCurrentPersonaSettings("user_123");

		expect(result).toBeNull();
	});

	it("maps record fields to PersonaSettingsSummary with ISO strings", async () => {
		const deployedAt = new Date("2026-06-06T10:00:00.000Z");
		const updatedAt = new Date("2026-06-06T12:00:00.000Z");
		selectLimit.mockResolvedValue([
			{
				agentPersona: "You are Hermes.",
				deployedServerId: "server_1",
				deployedServerHost: "1.2.3.4",
				deployedAt,
				updatedAt,
			},
		]);

		const result = await getCurrentPersonaSettings("user_123");

		expect(result).toEqual({
			agentPersona: "You are Hermes.",
			deployedServerHost: "1.2.3.4",
			deployedAt: deployedAt.toISOString(),
			updatedAt: updatedAt.toISOString(),
		});
	});

	it("returns null deployedServerHost and deployedAt when not set", async () => {
		const updatedAt = new Date("2026-06-06T12:00:00.000Z");
		selectLimit.mockResolvedValue([
			{
				agentPersona: "Draft persona",
				deployedServerId: null,
				deployedServerHost: null,
				deployedAt: null,
				updatedAt,
			},
		]);

		const result = await getCurrentPersonaSettings("user_123");

		expect(result).toEqual({
			agentPersona: "Draft persona",
			deployedServerHost: null,
			deployedAt: null,
			updatedAt: updatedAt.toISOString(),
		});
	});

	it("does not expose deployedServerId in the summary", async () => {
		const updatedAt = new Date("2026-06-06T12:00:00.000Z");
		selectLimit.mockResolvedValue([
			{
				agentPersona: "Some persona",
				deployedServerId: "server_abc",
				deployedServerHost: "5.6.7.8",
				deployedAt: null,
				updatedAt,
			},
		]);

		const result = await getCurrentPersonaSettings("user_123");

		expect(result).not.toHaveProperty("deployedServerId");
	});
});

describe("upsertHermesSettingsRecord", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		insertValues.mockReturnValue({ onConflictDoUpdate });
		onConflictDoUpdate.mockResolvedValue(undefined);
	});

	it("inserts a new record with required fields", async () => {
		const { getDb } = await import("../db");
		const { hermesSettings } = await import("../db/schema");

		await upsertHermesSettingsRecord(getDb(), {
			userId: "user_123",
			agentPersona: "You are Hermes.",
		});

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user_123",
				agentPersona: "You are Hermes.",
				deployedServerId: null,
				deployedServerHost: null,
				deployedAt: null,
			}),
		);
		expect(onConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				target: hermesSettings.userId,
				set: expect.objectContaining({
					agentPersona: "You are Hermes.",
				}),
			}),
		);
	});

	it("includes deployment fields in the upsert when provided", async () => {
		const { getDb } = await import("../db");

		const deployedAt = new Date("2026-06-06T12:00:00.000Z");

		await upsertHermesSettingsRecord(getDb(), {
			userId: "user_123",
			agentPersona: "You are Hermes.",
			deployedServerId: "server_1",
			deployedServerHost: "1.2.3.4",
			deployedAt,
		});

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user_123",
				agentPersona: "You are Hermes.",
				deployedServerId: "server_1",
				deployedServerHost: "1.2.3.4",
				deployedAt,
			}),
		);
		expect(onConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				set: expect.objectContaining({
					agentPersona: "You are Hermes.",
					deployedServerId: "server_1",
					deployedServerHost: "1.2.3.4",
					deployedAt,
				}),
			}),
		);
	});

	it("omits undefined optional fields from the conflict update set", async () => {
		const { getDb } = await import("../db");

		await upsertHermesSettingsRecord(getDb(), {
			userId: "user_123",
			agentPersona: "You are Hermes.",
			// deployedServerId, deployedServerHost, deployedAt are all omitted
		});

		expect(onConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				set: expect.not.objectContaining({
					deployedServerId: expect.anything(),
				}),
			}),
		);
		expect(onConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				set: expect.not.objectContaining({
					deployedServerHost: expect.anything(),
				}),
			}),
		);
		expect(onConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				set: expect.not.objectContaining({
					deployedAt: expect.anything(),
				}),
			}),
		);
	});

	it("sets deployment fields to null when explicitly passed null", async () => {
		const { getDb } = await import("../db");

		await upsertHermesSettingsRecord(getDb(), {
			userId: "user_123",
			agentPersona: "You are Hermes.",
			deployedServerId: null,
			deployedServerHost: null,
			deployedAt: null,
		});

		expect(onConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				set: expect.objectContaining({
					deployedServerId: null,
					deployedServerHost: null,
					deployedAt: null,
				}),
			}),
		);
	});

	it("always sets an updatedAt timestamp on the conflict update set", async () => {
		const { getDb } = await import("../db");

		await upsertHermesSettingsRecord(getDb(), {
			userId: "user_123",
			agentPersona: "You are Hermes.",
		});

		const callArg = onConflictDoUpdate.mock.calls[0][0];
		expect(callArg.set.updatedAt).toBeInstanceOf(Date);
	});
});