import { beforeEach, describe, expect, it, vi } from "vitest";

import { installEvents, installs } from "../db/schema";

const {
	selectLimit,
	selectOrderBy,
	insertValues,
	updateSet,
	updateWhere,
	dbSelect,
	dbInsert,
	dbUpdate,
	dbTransaction,
	txInsert,
	txUpdate,
	txSet,
	txWhere,
	txInsertValues,
} = vi.hoisted(() => ({
	selectLimit: vi.fn(),
	selectOrderBy: vi.fn(),
	insertValues: vi.fn(),
	updateSet: vi.fn(),
	updateWhere: vi.fn(),
	dbSelect: vi.fn(),
	dbInsert: vi.fn(),
	dbUpdate: vi.fn(),
	dbTransaction: vi.fn(),
	txInsert: vi.fn(),
	txUpdate: vi.fn(),
	txSet: vi.fn(),
	txWhere: vi.fn(),
	txInsertValues: vi.fn(),
}));

vi.mock("../db", () => ({
	getDb: () => ({
		select: dbSelect,
		insert: dbInsert,
		update: dbUpdate,
		transaction: dbTransaction,
	}),
}));

import {
	emitInstallEvent,
	ensureInstallStream,
	hydrateInstallEvents,
	installStreams,
	normalizeInstallStatus,
	resetInstallStream,
} from "./sse-stream";

describe("install SSE stream helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();

		dbSelect.mockImplementation(() => ({
			from: (table: unknown) => {
				if (table === installs) {
					return {
						where: () => ({
							orderBy: () => ({ limit: selectLimit }),
						}),
					};
				}

				if (table === installEvents) {
					return {
						where: () => ({
							orderBy: selectOrderBy,
						}),
					};
				}

				throw new Error("Unexpected table select");
			},
		}));

		dbInsert.mockImplementation((table: unknown) => {
			if (table === installEvents) {
				return { values: insertValues };
			}

			throw new Error("Unexpected table insert");
		});

		dbUpdate.mockImplementation((table: unknown) => {
			if (table === installs) {
				return { set: updateSet };
			}

			throw new Error("Unexpected table update");
		});

		dbTransaction.mockImplementation(
			async (callback: (tx: unknown) => Promise<unknown>) => {
				const tx = {
					insert: txInsert,
					update: txUpdate,
				};
				txInsert.mockImplementation((table: unknown) => {
					if (table === installEvents) {
						return { values: txInsertValues };
					}
					throw new Error("Unexpected table tx insert");
				});
				txUpdate.mockImplementation((table: unknown) => {
					if (table === installs) {
						return { set: txSet };
					}
					throw new Error("Unexpected table tx update");
				});
				txSet.mockReturnValue({ where: txWhere });
				txWhere.mockResolvedValue(undefined);
				txInsertValues.mockResolvedValue(undefined);
				return callback(tx);
			},
		);

		selectLimit.mockResolvedValue([]);
		selectOrderBy.mockResolvedValue([]);
		insertValues.mockResolvedValue(undefined);
		updateSet.mockReturnValue({ where: updateWhere });
		updateWhere.mockResolvedValue(undefined);
	});

	it("normalizes install status values", async () => {
		expect(normalizeInstallStatus("pending")).toBe("pending");
		expect(normalizeInstallStatus("running")).toBe("running");
		expect(normalizeInstallStatus("succeeded")).toBe("succeeded");
		expect(normalizeInstallStatus("failed")).toBe("failed");
		expect(normalizeInstallStatus("unknown")).toBe("pending");
		expect(normalizeInstallStatus(null)).toBe("pending");
	});

	it("hydrates persisted log lines into install events", async () => {
		const events = await hydrateInstallEvents("server_123", {
			id: "install_123",
			status: "running",
			step: "install-docker",
		});

		expect(events).toEqual([]);
	});

	it("resetInstallStream stores a pending in-memory stream and ensureInstallStream reuses it", async () => {
		installStreams.clear();
		const state = resetInstallStream("server_123", "install_123");
		const ensured = await ensureInstallStream("server_123");

		expect(ensured).toBe(state);
		expect(ensured.status).toBe("pending");
		expect(dbSelect).not.toHaveBeenCalled();
	});

	it("ensureInstallStream hydrates the latest persisted install when no stream exists", async () => {
		installStreams.clear();
		selectLimit.mockResolvedValueOnce([
			{
				id: "install_123",
				status: "failed",
				step: "failed",
			},
		]);
		selectOrderBy.mockResolvedValueOnce([
			{
				installId: "install_123",
				step: "install-docker",
				progress: 15,
				message: "Installing Docker",
				status: "failed",
				timestamp: new Date("2026-05-29T10:00:00.000Z"),
				error: null,
			},
		]);

		const state = await ensureInstallStream("server_123");

		expect(state.installId).toBe("install_123");
		expect(state.status).toBe("failed");
		expect(state.events).toHaveLength(1);
		expect(state.events[0]).toMatchObject({
			message: "Installing Docker",
			step: "install-docker",
			status: "failed",
		});
	});

	it("emitInstallEvent appends events, updates the DB, and notifies listeners", async () => {
		installStreams.clear();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-29T12:00:00.000Z"));

		const state = resetInstallStream("server_123", "install_123");
		const listener = vi.fn();
		state.listeners.add(listener);

		await emitInstallEvent({
			installId: "install_123",
			serverId: "server_123",
			runId: state.runId,
			step: "install-docker",
			progress: 15,
			message: "Installing Docker",
			status: "running",
		});

		expect(state.status).toBe("running");
		expect(state.events).toHaveLength(1);
		expect(state.events[0]).toMatchObject({
			installId: "install_123",
			serverId: "server_123",
			step: "install-docker",
			progress: 15,
			message: "Installing Docker",
			status: "running",
			timestamp: "2026-05-29T12:00:00.000Z",
		});
		expect(dbTransaction).toHaveBeenCalledTimes(1);
		expect(txInsertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				installId: "install_123",
				step: "install-docker",
				progress: 15,
				message: "Installing Docker",
				status: "running",
			}),
		);
		expect(txSet).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "running",
				step: "install-docker",
				version: "latest",
			}),
		);
		expect(txSet.mock.calls[0]?.[0]).not.toHaveProperty("log");
		expect(listener).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Installing Docker",
				status: "running",
			}),
		);
	});
});
