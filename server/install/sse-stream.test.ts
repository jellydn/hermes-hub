import { beforeEach, describe, expect, it, vi } from "vitest";

import { installEvents, installs } from "../db/schema";

const selectLimit = vi.fn();
const selectOrderBy = vi.fn();
const insertValues = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn();
const dbSelect = vi.fn();
const dbInsert = vi.fn();
const dbUpdate = vi.fn();

vi.mock("../db", () => ({
	getDb: () => ({
		select: dbSelect,
		insert: dbInsert,
		update: dbUpdate,
	}),
}));

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

		selectLimit.mockResolvedValue([]);
		selectOrderBy.mockResolvedValue([]);
		insertValues.mockResolvedValue(undefined);
		updateSet.mockReturnValue({ where: updateWhere });
		updateWhere.mockResolvedValue(undefined);
	});

	it("normalizes install status values", async () => {
		const { normalizeInstallStatus } = await import("./sse-stream");

		expect(normalizeInstallStatus("pending")).toBe("pending");
		expect(normalizeInstallStatus("running")).toBe("running");
		expect(normalizeInstallStatus("succeeded")).toBe("succeeded");
		expect(normalizeInstallStatus("failed")).toBe("failed");
		expect(normalizeInstallStatus("unknown")).toBe("pending");
		expect(normalizeInstallStatus(null)).toBe("pending");
	});

	it("hydrates persisted log lines into install events", async () => {
		const { hydrateInstallEvents } = await import("./sse-stream");

		const events = await hydrateInstallEvents("server_123", {
			id: "install_123",
			status: "running",
			step: "install-docker",
			log: [
				"2026-05-29T10:00:00.000Z [install-docker] Installing Docker",
				"2026-05-29T10:01:00.000Z [install-compose] Installing Compose",
			].join("\n"),
		});

		expect(events).toHaveLength(2);
		expect(events[0]).toMatchObject({
			installId: "install_123",
			serverId: "server_123",
			step: "install-docker",
			message: "Installing Docker",
			status: "running",
			progress: 50,
			timestamp: "2026-05-29T10:00:00.000Z",
		});
		expect(events[1]).toMatchObject({
			step: "install-compose",
			message: "Installing Compose",
			progress: 100,
		});
	});

	it("resetInstallStream stores a pending in-memory stream and ensureInstallStream reuses it", async () => {
		const { ensureInstallStream, installStreams, resetInstallStream } =
			await import("./sse-stream");

		installStreams.clear();
		const state = resetInstallStream("server_123", "install_123");
		const ensured = await ensureInstallStream("server_123");

		expect(ensured).toBe(state);
		expect(ensured.status).toBe("pending");
		expect(dbSelect).not.toHaveBeenCalled();
	});

	it("ensureInstallStream hydrates the latest persisted install when no stream exists", async () => {
		const { ensureInstallStream, installStreams } = await import(
			"./sse-stream"
		);

		installStreams.clear();
		selectLimit.mockResolvedValueOnce([
			{
				id: "install_123",
				status: "failed",
				step: "failed",
				log: "2026-05-29T10:00:00.000Z [install-docker] Installing Docker",
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
		const { emitInstallEvent, installStreams, resetInstallStream } =
			await import("./sse-stream");

		installStreams.clear();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-29T12:00:00.000Z"));

		const state = resetInstallStream("server_123", "install_123");
		const listener = vi.fn();
		state.listeners.add(listener);
		const logLines: string[] = [];

		await emitInstallEvent({
			installId: "install_123",
			serverId: "server_123",
			runId: state.runId,
			step: "install-docker",
			progress: 15,
			message: "Installing Docker",
			status: "running",
			logLines,
		});

		expect(logLines).toEqual([
			"2026-05-29T12:00:00.000Z [install-docker] Installing Docker",
		]);
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
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				installId: "install_123",
				step: "install-docker",
				progress: 15,
				message: "Installing Docker",
				status: "running",
			}),
		);
		expect(updateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "running",
				step: "install-docker",
				log: logLines.join("\n"),
				version: "latest",
			}),
		);
		expect(listener).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Installing Docker",
				status: "running",
			}),
		);
	});
});
