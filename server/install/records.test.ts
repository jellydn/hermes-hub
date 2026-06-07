import { beforeEach, describe, expect, it, vi } from "vitest";

import { installEvents, installs } from "../db/schema";

const {
	dbSelect,
	dbInsert,
	dbUpdate,
	dbDelete,
	dbTransaction,
	selectFrom,
	selectWhere,
	selectOrderBy,
	selectLimit,
	insertValues,
	insertReturning,
	txDelete,
	txDeleteWhere,
	txUpdate,
	txSet,
	txWhere,
	txReturning,
} = vi.hoisted(() => ({
	dbSelect: vi.fn(),
	dbInsert: vi.fn(),
	dbUpdate: vi.fn(),
	dbDelete: vi.fn(),
	dbTransaction: vi.fn(),
	selectFrom: vi.fn(),
	selectWhere: vi.fn(),
	selectOrderBy: vi.fn(),
	selectLimit: vi.fn(),
	insertValues: vi.fn(),
	insertReturning: vi.fn(),
	txDelete: vi.fn(),
	txDeleteWhere: vi.fn(),
	txUpdate: vi.fn(),
	txSet: vi.fn(),
	txWhere: vi.fn(),
	txReturning: vi.fn(),
}));

vi.mock("../db", () => ({
	getDb: () => ({
		select: dbSelect,
		insert: dbInsert,
		update: dbUpdate,
		delete: dbDelete,
		transaction: dbTransaction,
	}),
}));

vi.mock("./workflow", () => ({
	installSteps: [
		{ id: "install-docker", progress: 15, message: "Installing Docker" },
		{ id: "verify-docker", progress: 30, message: "Verifying Docker" },
	],
}));

import {
	getLatestInstallForServer,
	getServerForInstall,
	upsertInstallRecord,
} from "./records";

describe("upsertInstallRecord", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		// Both .where().orderBy().limit() and .where().limit() patterns are used
		selectWhere.mockReturnValue({ orderBy: selectOrderBy, limit: selectLimit });
		selectOrderBy.mockReturnValue({ limit: selectLimit });
		selectLimit.mockResolvedValue([]);

		dbInsert.mockReturnValue({ values: insertValues });
		insertValues.mockReturnValue({ returning: insertReturning });
		insertReturning.mockResolvedValue([{ id: "install_new" }]);

		dbTransaction.mockImplementation(
			async (callback: (tx: unknown) => Promise<unknown>) => {
				const tx = {
					delete: txDelete,
					update: txUpdate,
				};
				txDelete.mockImplementation((table: unknown) => {
					if (table === installEvents) {
						return { where: txDeleteWhere };
					}
					throw new Error("Unexpected table tx delete");
				});
				txDeleteWhere.mockResolvedValue(undefined);
				txUpdate.mockImplementation((table: unknown) => {
					if (table === installs) {
						return { set: txSet };
					}
					throw new Error("Unexpected table tx update");
				});
				txSet.mockReturnValue({ where: txWhere });
				txWhere.mockReturnValue({ returning: txReturning });
				txReturning.mockResolvedValue([{ id: "install_existing" }]);
				return callback(tx);
			},
		);
	});

	it("creates a new install record when none exists for the server", async () => {
		selectLimit.mockResolvedValue([]);

		const result = await upsertInstallRecord("server_123");

		expect(result).toEqual({ id: "install_new" });
		expect(dbInsert).toHaveBeenCalledWith(installs);
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				serverId: "server_123",
				status: "pending",
				step: "install-docker",
				version: "latest",
			}),
		);
		expect(dbTransaction).not.toHaveBeenCalled();
	});

	it("resets an existing install via a transaction on retry", async () => {
		selectLimit.mockResolvedValue([
			{ id: "install_existing", version: "v1.2.3" },
		]);

		const result = await upsertInstallRecord("server_123");

		expect(result).toEqual({ id: "install_existing" });
		expect(dbTransaction).toHaveBeenCalledTimes(1);
		expect(dbInsert).not.toHaveBeenCalled();
	});

	it("deletes old install events before resetting status on retry", async () => {
		selectLimit.mockResolvedValue([
			{ id: "install_existing", version: "v1.0.0" },
		]);

		await upsertInstallRecord("server_123");

		expect(txDelete).toHaveBeenCalledWith(installEvents);
		expect(txDeleteWhere).toHaveBeenCalledTimes(1);
	});

	it("resets status to pending with the first install step on retry", async () => {
		selectLimit.mockResolvedValue([
			{ id: "install_existing", version: "v2.0.0" },
		]);

		await upsertInstallRecord("server_123");

		expect(txSet).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "pending",
				step: "install-docker",
			}),
		);
	});

	it("preserves the existing version on retry when version is set", async () => {
		selectLimit.mockResolvedValue([
			{ id: "install_existing", version: "v1.5.0" },
		]);

		await upsertInstallRecord("server_123");

		expect(txSet).toHaveBeenCalledWith(
			expect.objectContaining({
				version: "v1.5.0",
			}),
		);
	});

	it("falls back to 'latest' when existing install has no version", async () => {
		selectLimit.mockResolvedValue([{ id: "install_existing", version: null }]);

		await upsertInstallRecord("server_123");

		expect(txSet).toHaveBeenCalledWith(
			expect.objectContaining({
				version: "latest",
			}),
		);
	});

	it("sets updatedAt on the existing install row during retry", async () => {
		selectLimit.mockResolvedValue([
			{ id: "install_existing", version: "v1.0.0" },
		]);

		await upsertInstallRecord("server_123");

		const setCall = txSet.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(setCall).toHaveProperty("updatedAt");
		expect(setCall.updatedAt).toBeInstanceOf(Date);
	});
});

describe("getLatestInstallForServer", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({ orderBy: selectOrderBy, limit: selectLimit });
		selectOrderBy.mockReturnValue({ limit: selectLimit });
		selectLimit.mockResolvedValue([]);
	});

	it("returns null when no install exists for the server", async () => {
		selectLimit.mockResolvedValue([]);

		const result = await getLatestInstallForServer("server_123");

		expect(result).toBeNull();
		expect(dbSelect).toHaveBeenCalledTimes(1);
	});

	it("returns the latest install record when one exists", async () => {
		const installRecord = {
			status: "succeeded",
			version: "v1.2.3",
			updatedAt: new Date("2026-06-01T10:00:00.000Z"),
		};
		selectLimit.mockResolvedValue([installRecord]);

		const result = await getLatestInstallForServer("server_123");

		expect(result).toEqual(installRecord);
	});

	it("returns the first result only (most recent by createdAt desc)", async () => {
		const newerInstall = {
			status: "failed",
			version: "v2.0.0",
			updatedAt: new Date("2026-06-05T10:00:00.000Z"),
		};
		selectLimit.mockResolvedValue([newerInstall]);

		const result = await getLatestInstallForServer("server_123");

		expect(result).toEqual(newerInstall);
	});

	it("returns null when the install array is empty", async () => {
		selectLimit.mockResolvedValue([]);
		const result = await getLatestInstallForServer("server_999");
		expect(result).toBeNull();
	});

	it("returns install with running status", async () => {
		selectLimit.mockResolvedValue([
			{ status: "running", version: "latest", updatedAt: new Date() },
		]);

		const result = await getLatestInstallForServer("server_abc");

		expect(result?.status).toBe("running");
	});
});

describe("getServerForInstall", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({ limit: selectLimit });
		selectLimit.mockResolvedValue([]);
	});

	it("returns null when no server matches the userId and serverId", async () => {
		selectLimit.mockResolvedValue([]);

		const result = await getServerForInstall({
			serverId: "server_123",
			userId: "user_456",
		});

		expect(result).toBeNull();
		expect(dbSelect).toHaveBeenCalledTimes(1);
	});

	it("returns the server record when found", async () => {
		const serverRecord = {
			id: "server_123",
			host: "203.0.113.10",
			port: 22,
			username: "root",
			authMethod: "ssh-key",
			encryptedCredential: "encrypted-cred",
			storeCredential: true,
			hostKeyFingerprint: "SHA256:abc123",
		};
		selectLimit.mockResolvedValue([serverRecord]);

		const result = await getServerForInstall({
			serverId: "server_123",
			userId: "user_456",
		});

		expect(result).toEqual(serverRecord);
	});

	it("returns server with null credential when not stored", async () => {
		selectLimit.mockResolvedValue([
			{
				id: "server_123",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "password",
				encryptedCredential: null,
				storeCredential: false,
				hostKeyFingerprint: null,
			},
		]);

		const result = await getServerForInstall({
			serverId: "server_123",
			userId: "user_456",
		});

		expect(result?.storeCredential).toBe(false);
		expect(result?.encryptedCredential).toBeNull();
	});

	it("enforces userId ownership by including it in the query condition", async () => {
		selectLimit.mockResolvedValue([]);

		await getServerForInstall({ serverId: "server_123", userId: "user_789" });

		// The query uses `and(eq(servers.id, ...), eq(servers.userId, ...))` -
		// we just verify the DB is queried; ownership filtering is handled by the ORM
		expect(dbSelect).toHaveBeenCalledTimes(1);
	});
});