import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	decryptSecret,
	encryptSecret,
	getActiveEncryptionKeyVersion,
} from "../crypto";
import {
	aiProviders,
	mcpServers,
	servers,
	serverWebUi,
	telegramConfigs,
} from "../db/schema";
import type { EncryptedSecretMap } from "../settings/mcp/types";
import {
	applyReencryption,
	planReencryption,
	type ReencryptionDb,
} from "./re-encryption-runner";

vi.mock("./logger", () => ({
	logger: { warn: vi.fn() },
}));

type FakeRows = {
	aiProviders: Array<Record<string, unknown>>;
	telegramConfigs: Array<Record<string, unknown>>;
	servers: Array<Record<string, unknown>>;
	serverWebUi: Array<Record<string, unknown>>;
	mcpServers: Array<Record<string, unknown>>;
};

function emptyRows(): FakeRows {
	return {
		aiProviders: [],
		telegramConfigs: [],
		servers: [],
		serverWebUi: [],
		mcpServers: [],
	};
}

function createFakeDb(rows: FakeRows) {
	const updateCalls: Array<{
		table: unknown;
		values: Record<string, unknown>;
	}> = [];
	const transactionCalls: number[] = [];

	const fromFor = (table: unknown): Array<Record<string, unknown>> => {
		if (table === aiProviders) return rows.aiProviders;
		if (table === telegramConfigs) return rows.telegramConfigs;
		if (table === servers) return rows.servers;
		if (table === serverWebUi) return rows.serverWebUi;
		if (table === mcpServers) return rows.mcpServers;
		return [];
	};

	const db = {
		select: () => ({
			from: async (table: unknown) => fromFor(table),
		}),
		update: (table: unknown) => ({
			set: (values: Record<string, unknown>) => ({
				where: async () => {
					updateCalls.push({ table, values });
					// Mutate the in-memory rows so a re-run sees the new state.
					for (const row of fromFor(table)) {
						Object.assign(row, values);
					}
				},
			}),
		}),
		transaction: async (callback: (tx: unknown) => Promise<void>) => {
			transactionCalls.push(1);
			await callback(db);
		},
	};

	return {
		db: db as unknown as ReencryptionDb,
		updateCalls,
		transactionCalls,
		rows,
	};
}

describe("re-encryption runner", () => {
	const originalEnv = process.env.ENCRYPTION_KEY;

	beforeEach(() => {
		process.env.ENCRYPTION_KEY = "test-encryption-key";
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		if (originalEnv === undefined) {
			delete process.env.ENCRYPTION_KEY;
		} else {
			process.env.ENCRYPTION_KEY = originalEnv;
		}
	});

	it("rewrites a stale v1 row to the active version and flips the version column", async () => {
		// Payloads created before stubbing V2 are v1.
		const v1Payload = encryptSecret("sk-old");
		vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");

		const { db, updateCalls, transactionCalls } = createFakeDb({
			...emptyRows(),
			aiProviders: [
				{
					id: "ap_1",
					encryptedApiKey: v1Payload,
					encryptionKeyVersion: "v1",
				},
			],
		});

		const result = await applyReencryption(db);

		expect(result).toEqual({
			ok: true,
			reencrypted: 1,
			perTableCounts: { ai_providers: 1 },
		});
		expect(transactionCalls).toHaveLength(1);
		expect(updateCalls).toHaveLength(1);
		expect(updateCalls[0]?.values).toMatchObject({
			encryptionKeyVersion: "v2",
		});
		const rewritten = updateCalls[0]?.values.encryptedApiKey as string;
		expect(rewritten.startsWith("v2.")).toBe(true);
		expect(decryptSecret(rewritten)).toBe("sk-old");
	});

	it("skips rows already at the active version and is a no-op on re-run", async () => {
		vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");
		const v2Payload = encryptSecret("sk-active");

		const { db, updateCalls } = createFakeDb({
			...emptyRows(),
			aiProviders: [
				{
					id: "ap_1",
					encryptedApiKey: v2Payload,
					encryptionKeyVersion: "v2",
				},
			],
		});

		const first = await applyReencryption(db);
		expect(first).toEqual({ ok: true, reencrypted: 0, perTableCounts: {} });
		expect(updateCalls).toHaveLength(0);

		// Idempotency: a v1 row rewritten once becomes v2, so a second run
		// has nothing to do. Create the v1 payload while the v2 stub is NOT
		// yet active.
		vi.unstubAllEnvs();
		const v1Payload = encryptSecret("sk");
		vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");
		const v1Rows = createFakeDb({
			...emptyRows(),
			aiProviders: [
				{ id: "ap_1", encryptedApiKey: v1Payload, encryptionKeyVersion: "v1" },
			],
		});
		const run = await applyReencryption(v1Rows.db);
		expect(run).toEqual({
			ok: true,
			reencrypted: 1,
			perTableCounts: { ai_providers: 1 },
		});
		const second = await applyReencryption(v1Rows.db);
		expect(second).toEqual({ ok: true, reencrypted: 0, perTableCounts: {} });
		expect(v1Rows.updateCalls).toHaveLength(1);
	});

	it("treats a legacy prefix-less payload as v1 and rewrites it", async () => {
		// Strip the "v1." prefix to simulate a pre-versioning payload.
		const legacyPayload = encryptSecret("legacy-secret").slice(3);
		vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");

		const { db, updateCalls } = createFakeDb({
			...emptyRows(),
			aiProviders: [
				{
					id: "ap_1",
					encryptedApiKey: legacyPayload,
					encryptionKeyVersion: "v1",
				},
			],
		});

		const result = await applyReencryption(db);

		expect(result).toEqual({
			ok: true,
			reencrypted: 1,
			perTableCounts: { ai_providers: 1 },
		});
		const rewritten = updateCalls[0]?.values.encryptedApiKey as string;
		expect(rewritten.startsWith("v2.")).toBe(true);
		expect(decryptSecret(rewritten)).toBe("legacy-secret");
	});

	it("rewrites mcp_servers maps per entry, preserving last4 and untouched keys", async () => {
		// Mixed-version map: one v1 entry (created pre-stub) + one v2 entry.
		const staleEnv = encryptSecret("env-secret");
		vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");
		const activeEnv = encryptSecret("active-env");

		const map: EncryptedSecretMap = {
			STALE_KEY: { encrypted: staleEnv, last4: "1234" },
			ACTIVE_KEY: { encrypted: activeEnv, last4: "5678" },
		};

		const { db, updateCalls } = createFakeDb({
			...emptyRows(),
			mcpServers: [
				{
					id: "mcp_1",
					encryptedEnv: map,
					encryptedHeaders: {},
				},
			],
		});

		const result = await applyReencryption(db);

		expect(result).toEqual({
			ok: true,
			reencrypted: 1,
			perTableCounts: { mcp_servers: 1 },
		});
		expect(updateCalls).toHaveLength(1);
		const nextMap = updateCalls[0]?.values.encryptedEnv as EncryptedSecretMap;
		expect(decryptSecret(nextMap.STALE_KEY.encrypted)).toBe("env-secret");
		expect(nextMap.STALE_KEY.last4).toBe("1234");
		// Untouched entry is preserved byte-for-byte.
		expect(nextMap.ACTIVE_KEY).toEqual({ encrypted: activeEnv, last4: "5678" });
	});

	it("rewrites both telegram bot_token and api_server_key when both are stale", async () => {
		const botPayload = encryptSecret("bot-token");
		const keyPayload = encryptSecret("api-key");
		vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");

		const { db, updateCalls } = createFakeDb({
			...emptyRows(),
			telegramConfigs: [
				{
					id: "tg_1",
					botToken: botPayload,
					apiServerKey: keyPayload,
					encryptionKeyVersion: "v1",
				},
			],
		});

		const result = await applyReencryption(db);

		expect(result).toEqual({
			ok: true,
			reencrypted: 2,
			perTableCounts: { telegram_configs: 2 },
		});
		const botUpdate = updateCalls.find(
			(call) => call.values.botToken !== undefined,
		);
		const keyUpdate = updateCalls.find(
			(call) => call.values.apiServerKey !== undefined,
		);
		expect(botUpdate?.values.encryptionKeyVersion).toBe("v2");
		expect(keyUpdate?.values.encryptionKeyVersion).toBe("v2");
		expect(decryptSecret(botUpdate?.values.botToken as string)).toBe(
			"bot-token",
		);
		expect(decryptSecret(keyUpdate?.values.apiServerKey as string)).toBe(
			"api-key",
		);
	});

	it("skips NULL credential rows in servers and server_web_ui", async () => {
		vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");

		const { db, updateCalls } = createFakeDb({
			...emptyRows(),
			servers: [{ id: "srv_1", encryptedCredential: null }],
			serverWebUi: [{ id: "wu_1", encryptedPassword: null }],
		});

		const result = await applyReencryption(db);

		expect(result).toEqual({ ok: true, reencrypted: 0, perTableCounts: {} });
		expect(updateCalls).toHaveLength(0);
	});

	it("fails fast: one corrupt payload aborts with zero writes and names the row", async () => {
		vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");

		const { db, updateCalls, transactionCalls } = createFakeDb({
			...emptyRows(),
			aiProviders: [
				{
					id: "ap_bad",
					encryptedApiKey: "garbage-payload-without-dots",
					encryptionKeyVersion: "v1",
				},
			],
			servers: [{ id: "srv_1", encryptedCredential: encryptSecret("fine") }],
		});

		const result = await applyReencryption(db);

		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({
			table: "ai_providers",
			id: "ap_bad",
			column: "encrypted_api_key",
		});
		expect(result.errors[0]?.reason).toContain("Encrypted payload is invalid");
		expect(transactionCalls).toHaveLength(0);
		expect(updateCalls).toHaveLength(0);
	});

	it("surfaces the descriptive legacy-plaintext error for api_server_key", async () => {
		const botPayload = encryptSecret("bot-token");
		vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");

		const { db, updateCalls } = createFakeDb({
			...emptyRows(),
			telegramConfigs: [
				{
					id: "tg_1",
					botToken: botPayload,
					apiServerKey: "legacy-plaintext-key",
					encryptionKeyVersion: "v1",
				},
			],
		});

		const result = await applyReencryption(db);

		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({
			table: "telegram_configs",
			id: "tg_1",
			column: "api_server_key",
		});
		expect(result.errors[0]?.reason).toContain("legacy plaintext");
		expect(updateCalls).toHaveLength(0);
	});

	it("is a no-op when ENCRYPTION_KEY_V2 is unset (active version is v1)", async () => {
		const v1Payload = encryptSecret("sk");

		const { db, updateCalls } = createFakeDb({
			...emptyRows(),
			aiProviders: [
				{ id: "ap_1", encryptedApiKey: v1Payload, encryptionKeyVersion: "v1" },
			],
		});

		expect(getActiveEncryptionKeyVersion()).toBe("v1");
		const plan = await planReencryption(db);
		expect(plan.staleCount).toBe(0);
		expect(plan.errors).toHaveLength(0);

		const result = await applyReencryption(db);
		expect(result).toEqual({ ok: true, reencrypted: 0, perTableCounts: {} });
		expect(updateCalls).toHaveLength(0);
	});

	it("reports row identifiers and per-table counts from the plan", async () => {
		const v1A = encryptSecret("a");
		const v1B = encryptSecret("b");
		const v1C = encryptSecret("c");
		vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");

		const { db } = createFakeDb({
			...emptyRows(),
			aiProviders: [
				{ id: "ap_1", encryptedApiKey: v1A, encryptionKeyVersion: "v1" },
				{ id: "ap_2", encryptedApiKey: v1B, encryptionKeyVersion: "v1" },
			],
			servers: [{ id: "srv_1", encryptedCredential: v1C }],
		});

		const plan = await planReencryption(db);

		expect(plan.activeVersion).toBe("v2");
		expect(plan.staleCount).toBe(3);
		expect(plan.perTableCounts).toEqual({ ai_providers: 2, servers: 1 });
		expect(plan.stale.map((row) => row.id)).toEqual(["ap_1", "ap_2", "srv_1"]);
		expect(plan.errors).toHaveLength(0);
	});
});
