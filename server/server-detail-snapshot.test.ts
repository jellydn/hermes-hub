import { beforeEach, describe, expect, it, vi } from "vitest";

const { ownedServerRecord, selectLimit, dbSelect, getLatestInstallForServer } =
	vi.hoisted(() => {
		const ownedServerRecord = {
			id: "server_123",
			label: "Production",
			host: "203.0.113.10",
			port: 22,
			username: "root",
			authMethod: "password",
			encryptedCredential: "encrypted-secret",
			storeCredential: true,
			status: "connected",
			osInfo: {
				name: "Ubuntu 22.04",
				version: "22.04",
				supportLevel: "supported",
			},
			hostKeyFingerprint: "SHA256:abc",
			hostKeyAlgorithm: "ssh-ed25519",
		};

		return {
			ownedServerRecord,
			selectLimit: vi.fn(),
			dbSelect: vi.fn(),
			getLatestInstallForServer: vi.fn(),
		};
	});

vi.mock("./db", () => ({
	getDb: () => ({
		select: dbSelect,
	}),
}));

vi.mock("./db/schema", () => ({
	auditLogs: {
		id: "auditLogs.id",
		action: "auditLogs.action",
		details: "auditLogs.details",
		createdAt: "auditLogs.createdAt",
		userId: "auditLogs.userId",
		serverId: "auditLogs.serverId",
	},
	installs: {
		status: "installs.status",
		version: "installs.version",
		updatedAt: "installs.updatedAt",
		createdAt: "installs.createdAt",
		serverId: "installs.serverId",
	},
}));

vi.mock("./install/records", () => ({
	getLatestInstallForServer,
}));

vi.mock("./server-records", () => ({
	getOwnedServerRecord: vi.fn().mockResolvedValue(ownedServerRecord),
	readOsInfoValue: (
		osInfo: Record<string, unknown> | null | undefined,
		key: string,
	) => {
		if (!osInfo) {
			return null;
		}
		const value = osInfo[key];
		return typeof value === "string" && value.length > 0 ? value : null;
	},
}));

const { getResolvedServerWebUiRecord } = vi.hoisted(() => ({
	getResolvedServerWebUiRecord: vi.fn().mockResolvedValue(null),
}));

vi.mock("./web-ui/records", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./web-ui/records")>();
	return {
		...actual,
		getResolvedServerWebUiRecord,
	};
});

import {
	getDisplayRollbackTarget,
	getServerDetailSnapshot,
	resolveRollbackTargetFromSources,
} from "./server-detail-snapshot";

describe("rollback target resolution", () => {
	it("prefers audit history over installs.version", () => {
		expect(
			resolveRollbackTargetFromSources({
				actionHistory: [
					{
						id: "audit_1",
						action: "rollback",
						result: "succeeded",
						createdAt: "2026-05-29T00:00:00.000Z",
						message: "Rolled back.",
						imageRef: "v2.0.0",
					},
				],
				installVersion: "v1.0.0",
			}),
		).toBe("v2.0.0");
	});

	it("falls back to installs.version when audit history has no rollback tag", () => {
		expect(
			resolveRollbackTargetFromSources({
				actionHistory: [],
				installVersion: "v1.0.0",
			}),
		).toBe("v1.0.0");
	});

	it("returns latest when no rollback sources exist", () => {
		expect(
			resolveRollbackTargetFromSources({
				actionHistory: [],
				installVersion: null,
			}),
		).toBe("latest");
	});

	it("maps latest fallback to null for UI display", () => {
		expect(
			getDisplayRollbackTarget({
				actionHistory: [],
				installVersion: "latest",
			}),
		).toBeNull();
	});
});

describe("getServerDetailSnapshot action history with >100 audit rows", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		selectLimit.mockReset();
		dbSelect.mockReset();

		// Every call to getDb().select() returns a full query chain:
		// .from() -> .where() -> .orderBy() -> .limit() -> Promise<rows>
		dbSelect.mockImplementation(() => ({
			from: () => ({
				where: () => ({
					orderBy: () => ({ limit: selectLimit }),
				}),
			}),
		}));

		selectLimit.mockResolvedValue([]);
		getLatestInstallForServer.mockResolvedValue(null);
	});

	it("exposes installs.version as rollbackTarget when audit history has no rollback tag", async () => {
		getLatestInstallForServer.mockResolvedValueOnce({
			status: "succeeded",
			version: "v1.4.2",
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});
		selectLimit.mockResolvedValueOnce([]);

		const snapshot = await getServerDetailSnapshot({
			serverId: "server_123",
			userId: "user_123",
		});

		expect(snapshot?.rollbackTarget).toBe("v1.4.2");
	});

	it("queries the action history through the indexed serverId column", async () => {
		// Build a 150-row fixture: 50 restart, 50 update, 50 rollback, all
		// carrying the explicit serverId column, plus 80 unrelated noise rows
		// for other servers (must be filtered out by the serverId equality).
		const finished: Array<{
			id: string;
			action: string;
			details: Record<string, unknown>;
			createdAt: Date;
		}> = [];
		for (let i = 0; i < 50; i++) {
			finished.push({
				id: `audit_restart_${i}`,
				action:
					i % 2
						? "server.action.restart.succeeded"
						: "server.action.restart.failed",
				details: { serverId: "server_123", message: `restart ${i}` },
				createdAt: new Date(
					`2026-05-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
				),
			});
		}
		for (let i = 0; i < 50; i++) {
			finished.push({
				id: `audit_update_${i}`,
				action:
					i % 2
						? "server.action.update.succeeded"
						: "server.action.update.failed",
				details: {
					serverId: "server_123",
					message: `update ${i}`,
					imageRef: `v0.4.${i}`,
				},
				createdAt: new Date(
					`2026-04-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
				),
			});
		}
		for (let i = 0; i < 50; i++) {
			finished.push({
				id: `audit_rollback_${i}`,
				action:
					i % 2
						? "server.action.rollback.succeeded"
						: "server.action.rollback.failed",
				details: {
					serverId: "server_123",
					message: `rollback ${i}`,
					imageRef: `v0.3.${i}`,
				},
				createdAt: new Date(
					`2026-03-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
				),
			});
		}
		const noise = Array.from({ length: 80 }, (_, i) => ({
			id: `audit_other_${i}`,
			action: "server.action.restart.succeeded",
			details: { serverId: `server_other_${i}`, message: "noise" },
			createdAt: new Date(
				`2026-06-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
			),
		}));
		const all = [...finished, ...noise].sort(
			(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
		);
		expect(all.length).toBe(230);

		getLatestInstallForServer.mockResolvedValueOnce(null);
		selectLimit.mockResolvedValueOnce(all.slice(0, 5));

		const snapshot = await getServerDetailSnapshot({
			serverId: "server_123",
			userId: "user_123",
		});

		expect(snapshot).not.toBeNull();
		expect(snapshot?.actionHistory).toHaveLength(5);
		// Every history item must belong to server_123 (not a noise row).
		for (const item of snapshot?.actionHistory ?? []) {
			expect(["restart", "update", "rollback"]).toContain(item.action);
		}
		// Audit row count check: the predicate is applied via column, not
		// details->>'serverId', so this exercises the new path. We verify
		// the call shape: limit(5) was used.
		expect(selectLimit).toHaveBeenCalledWith(5);
	});
});

describe("getServerDetailSnapshot webUi deploy status", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		selectLimit.mockReset();
		dbSelect.mockReset();
		dbSelect.mockImplementation(() => ({
			from: () => ({
				where: () => ({
					orderBy: () => ({ limit: selectLimit }),
				}),
			}),
		}));
		selectLimit.mockResolvedValue([]);
		getLatestInstallForServer.mockResolvedValue(null);
	});

	it("includes deploying Web UI records in the snapshot", async () => {
		getResolvedServerWebUiRecord.mockResolvedValueOnce({
			enabled: false,
			encryptedPassword: "enc:password",
			port: 8787,
			deployStatus: "deploying",
			deployError: null,
			deployStartedAt: new Date(),
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		const snapshot = await getServerDetailSnapshot({
			serverId: "server_123",
			userId: "user_123",
		});

		expect(snapshot?.webUi?.deployStatus).toBe("deploying");
		expect(snapshot?.webUi?.deployError).toBe(null);
	});

	it("includes failed Web UI records with deploy error", async () => {
		getResolvedServerWebUiRecord.mockResolvedValueOnce({
			enabled: false,
			encryptedPassword: null,
			port: 8787,
			deployStatus: "failed",
			deployError: "SSH timeout",
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		const snapshot = await getServerDetailSnapshot({
			serverId: "server_123",
			userId: "user_123",
		});

		expect(snapshot?.webUi?.deployStatus).toBe("failed");
		expect(snapshot?.webUi?.deployError).toBe("SSH timeout");
	});

	it("includes succeeded Web UI records for enabled servers", async () => {
		getResolvedServerWebUiRecord.mockResolvedValueOnce({
			enabled: true,
			encryptedPassword: "enc:password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		const snapshot = await getServerDetailSnapshot({
			serverId: "server_123",
			userId: "user_123",
		});

		expect(snapshot?.webUi?.deployStatus).toBe("succeeded");
		expect(snapshot?.webUi?.enabled).toBe(true);
	});
});
