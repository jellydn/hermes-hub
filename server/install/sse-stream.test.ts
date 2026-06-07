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
	releaseInstallStream,
	resetInstallStream,
	tryClaimInstallStream,
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
			}),
		);
		expect(txSet.mock.calls[0]?.[0]).not.toHaveProperty("version");
		expect(txSet.mock.calls[0]?.[0]).not.toHaveProperty("log");
		expect(listener).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Installing Docker",
				status: "running",
			}),
		);
	});

	it("emitInstallEvent is a no-op when runId does not match the active stream", async () => {
		installStreams.clear();
		const state = resetInstallStream("server_123", "install_123");
		const listener = vi.fn();
		state.listeners.add(listener);

		await emitInstallEvent({
			installId: "install_123",
			serverId: "server_123",
			runId: "stale-run-id",
			step: "install-docker",
			progress: 15,
			message: "Should be ignored",
			status: "running",
		});

		expect(state.events).toHaveLength(0);
		expect(listener).not.toHaveBeenCalled();
		expect(dbTransaction).not.toHaveBeenCalled();
	});

	it("emitInstallEvent is a no-op when no stream exists for the server", async () => {
		installStreams.clear();

		await emitInstallEvent({
			installId: "install_999",
			serverId: "nonexistent_server",
			runId: "any-run-id",
			step: "install-docker",
			progress: 10,
			message: "Ghost event",
			status: "running",
		});

		expect(dbTransaction).not.toHaveBeenCalled();
	});

	it("emitInstallEvent includes error field when provided", async () => {
		installStreams.clear();
		const state = resetInstallStream("server_err", "install_err");

		await emitInstallEvent({
			installId: "install_err",
			serverId: "server_err",
			runId: state.runId,
			step: "install-docker",
			progress: 15,
			message: "Failed",
			status: "failed",
			error: "Connection refused",
		});

		expect(state.events[0]).toMatchObject({
			error: "Connection refused",
			status: "failed",
		});
		expect(txInsertValues).toHaveBeenCalledWith(
			expect.objectContaining({ error: "Connection refused" }),
		);
	});
});

describe("tryClaimInstallStream", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installStreams.clear();
	});

	it("claims a slot when no stream exists for the server", () => {
		const state = tryClaimInstallStream("server_new");

		expect(state).not.toBeNull();
		expect(state?.serverId).toBe("server_new");
		expect(state?.status).toBe("pending");
		expect(installStreams.has("server_new")).toBe(true);
	});

	it("returns null when an active running stream already exists", () => {
		const existing = resetInstallStream("server_running", "install_123");
		existing.status = "running";

		const claimed = tryClaimInstallStream("server_running");

		expect(claimed).toBeNull();
	});

	it("returns null when a pending stream already exists", () => {
		resetInstallStream("server_pending", "install_456");
		// status is "pending" by default

		const claimed = tryClaimInstallStream("server_pending");

		expect(claimed).toBeNull();
	});

	it("allows claiming when the existing stream has succeeded", () => {
		const existing = resetInstallStream("server_done", "install_789");
		existing.status = "succeeded";

		const claimed = tryClaimInstallStream("server_done");

		expect(claimed).not.toBeNull();
		expect(claimed?.status).toBe("pending");
	});

	it("allows claiming when the existing stream has failed", () => {
		const existing = resetInstallStream("server_failed", "install_abc");
		existing.status = "failed";

		const claimed = tryClaimInstallStream("server_failed");

		expect(claimed).not.toBeNull();
	});

	it("generates a unique runId for each claimed stream", () => {
		const first = tryClaimInstallStream("server_a");
		first!.status = "succeeded";
		const second = tryClaimInstallStream("server_a");

		expect(first!.runId).not.toBe(second!.runId);
	});

	it("sets installId to empty string so caller must populate it", () => {
		const state = tryClaimInstallStream("server_id_check");

		expect(state?.installId).toBe("");
	});
});

describe("releaseInstallStream", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installStreams.clear();
	});

	it("removes the stream when runId matches", () => {
		const state = resetInstallStream("server_rel", "install_rel");
		const { runId } = state;

		releaseInstallStream("server_rel", runId);

		expect(installStreams.has("server_rel")).toBe(false);
	});

	it("does not remove stream when runId does not match", () => {
		resetInstallStream("server_rel", "install_rel");

		releaseInstallStream("server_rel", "wrong-run-id");

		expect(installStreams.has("server_rel")).toBe(true);
	});

	it("is a no-op when no stream exists for the server", () => {
		expect(() =>
			releaseInstallStream("nonexistent_server", "any-run-id"),
		).not.toThrow();
	});

	it("prevents claim-release-reclaim from interfering with a newer claim", () => {
		const first = tryClaimInstallStream("server_lifecycle");
		first!.status = "failed";

		const second = tryClaimInstallStream("server_lifecycle");
		expect(second).not.toBeNull();
		const secondRunId = second!.runId;

		// Attempting to release with the first runId should be a no-op
		releaseInstallStream("server_lifecycle", first!.runId);

		expect(installStreams.has("server_lifecycle")).toBe(true);
		expect(installStreams.get("server_lifecycle")?.runId).toBe(secondRunId);
	});
});
