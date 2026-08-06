import { eq } from "drizzle-orm";

import {
	decryptApiServerKey,
	decryptSecret,
	encryptSecret,
	getActiveEncryptionKeyVersion,
} from "../crypto";
import type { getDb } from "../db";
import {
	aiProviders,
	mcpServers,
	servers,
	serverWebUi,
	telegramConfigs,
} from "../db/schema";
import type { EncryptedSecretMap } from "../settings/mcp/types";

const VERSIONED_PREFIX_PATTERN = /^v\d+$/;

type ReencryptionSelect = Pick<ReturnType<typeof getDb>, "select">;
export type ReencryptionDb = Pick<
	ReturnType<typeof getDb>,
	"select" | "update" | "transaction"
>;

export type ReencryptionError = {
	table: string;
	id: string;
	column: string;
	reason: string;
};

export type StaleRow =
	| {
			table: "ai_providers";
			id: string;
			column: "encrypted_api_key";
			payload: string;
	  }
	| {
			table: "telegram_configs";
			id: string;
			column: "bot_token" | "api_server_key";
			payload: string;
	  }
	| {
			table: "servers";
			id: string;
			column: "encrypted_credential";
			payload: string;
	  }
	| {
			table: "server_web_ui";
			id: string;
			column: "encrypted_password";
			payload: string;
	  }
	| {
			table: "mcp_servers";
			id: string;
			column: "encrypted_env" | "encrypted_headers";
			map: EncryptedSecretMap;
			staleKeys: string[];
	  };

export type ReencryptionPlan = {
	activeVersion: string;
	stale: StaleRow[];
	staleCount: number;
	perTableCounts: Record<string, number>;
	errors: ReencryptionError[];
};

export type ReencryptionResult =
	| { ok: true; reencrypted: number; perTableCounts: Record<string, number> }
	| { ok: false; errors: ReencryptionError[] };

/**
 * Resolve the wire-format version of a payload without decrypting.
 * Mirrors crypto.ts parsePayload: a `vN.` prefix selects the version,
 * a prefix-less legacy payload is `v1`, anything else is invalid.
 */
function detectPayloadVersion(payload: string): string | null {
	const allParts = payload.split(".");

	if (allParts.length === 4 && VERSIONED_PREFIX_PATTERN.test(allParts[0])) {
		return allParts[0];
	}

	if (allParts.length === 3) {
		// A truncated versioned payload (v1.a.b) must not fall through to
		// the legacy branch — its first segment is a version, not an IV.
		if (VERSIONED_PREFIX_PATTERN.test(allParts[0])) {
			return null;
		}
		return "v1";
	}

	return null;
}

function inspectPayload(
	payload: string,
	table: string,
	id: string,
	column: string,
	activeVersion: string,
	decrypt: (payload: string) => string,
): { stale: boolean } | { error: ReencryptionError } {
	// Decrypt FIRST: for api_server_key this surfaces the descriptive
	// plan-005 legacy-plaintext error; for corrupt payloads it throws the
	// real decrypt error instead of a shape mismatch.
	try {
		decrypt(payload);
	} catch (error) {
		return {
			error: {
				table,
				id,
				column,
				reason: error instanceof Error ? error.message : String(error),
			},
		};
	}

	const version = detectPayloadVersion(payload);
	if (version === null) {
		return {
			error: {
				table,
				id,
				column,
				reason: "Encrypted payload is invalid",
			},
		};
	}

	return { stale: version !== activeVersion };
}

function recordStale(
	plan: ReencryptionPlan,
	perTableKey: string,
	entry: { stale: boolean } | { error: ReencryptionError },
	staleRow: StaleRow,
) {
	if ("error" in entry) {
		plan.errors.push(entry.error);
		return;
	}
	if (!entry.stale) {
		return;
	}
	plan.stale.push(staleRow);
	plan.staleCount += 1;
	plan.perTableCounts[perTableKey] =
		(plan.perTableCounts[perTableKey] ?? 0) + 1;
}

/**
 * Read-only preflight + rewrite plan. Loads every encrypted payload across
 * the seven encrypted surfaces, validates that each decrypts under its own
 * version's key, and lists the rows that would be rewritten.
 */
export async function planReencryption(
	db: ReencryptionSelect,
): Promise<ReencryptionPlan> {
	const activeVersion = getActiveEncryptionKeyVersion();
	const plan: ReencryptionPlan = {
		activeVersion,
		stale: [],
		staleCount: 0,
		perTableCounts: {},
		errors: [],
	};

	const aiRows = await db.select().from(aiProviders);
	for (const row of aiRows) {
		const entry = inspectPayload(
			row.encryptedApiKey,
			"ai_providers",
			row.id,
			"encrypted_api_key",
			activeVersion,
			decryptSecret,
		);
		recordStale(plan, "ai_providers", entry, {
			table: "ai_providers",
			id: row.id,
			column: "encrypted_api_key",
			payload: row.encryptedApiKey,
		});
	}

	const telegramRows = await db.select().from(telegramConfigs);
	for (const row of telegramRows) {
		const botEntry = inspectPayload(
			row.botToken,
			"telegram_configs",
			row.id,
			"bot_token",
			activeVersion,
			decryptSecret,
		);
		recordStale(plan, "telegram_configs", botEntry, {
			table: "telegram_configs",
			id: row.id,
			column: "bot_token",
			payload: row.botToken,
		});

		if (row.apiServerKey) {
			const keyEntry = inspectPayload(
				row.apiServerKey,
				"telegram_configs",
				row.id,
				"api_server_key",
				activeVersion,
				decryptApiServerKey,
			);
			recordStale(plan, "telegram_configs", keyEntry, {
				table: "telegram_configs",
				id: row.id,
				column: "api_server_key",
				payload: row.apiServerKey,
			});
		}
	}

	const serverRows = await db.select().from(servers);
	for (const row of serverRows) {
		if (!row.encryptedCredential) {
			continue;
		}
		const entry = inspectPayload(
			row.encryptedCredential,
			"servers",
			row.id,
			"encrypted_credential",
			activeVersion,
			decryptSecret,
		);
		recordStale(plan, "servers", entry, {
			table: "servers",
			id: row.id,
			column: "encrypted_credential",
			payload: row.encryptedCredential,
		});
	}

	const webUiRows = await db.select().from(serverWebUi);
	for (const row of webUiRows) {
		if (!row.encryptedPassword) {
			continue;
		}
		const entry = inspectPayload(
			row.encryptedPassword,
			"server_web_ui",
			row.id,
			"encrypted_password",
			activeVersion,
			decryptSecret,
		);
		recordStale(plan, "server_web_ui", entry, {
			table: "server_web_ui",
			id: row.id,
			column: "encrypted_password",
			payload: row.encryptedPassword,
		});
	}

	const mcpRows = await db.select().from(mcpServers);
	for (const row of mcpRows) {
		for (const column of [
			{ name: "encrypted_env" as const, value: row.encryptedEnv },
			{ name: "encrypted_headers" as const, value: row.encryptedHeaders },
		]) {
			const staleKeys: string[] = [];
			let errored = false;

			for (const [key, entry] of Object.entries(column.value)) {
				const inspected = inspectPayload(
					entry.encrypted,
					"mcp_servers",
					row.id,
					`${column.name}["${key}"]`,
					activeVersion,
					decryptSecret,
				);
				if ("error" in inspected) {
					plan.errors.push(inspected.error);
					errored = true;
					continue;
				}
				if (inspected.stale) {
					staleKeys.push(key);
				}
			}

			if (!errored && staleKeys.length > 0) {
				plan.stale.push({
					table: "mcp_servers",
					id: row.id,
					column: column.name,
					map: column.value,
					staleKeys,
				});
				plan.staleCount += staleKeys.length;
				plan.perTableCounts["mcp_servers"] =
					(plan.perTableCounts["mcp_servers"] ?? 0) + staleKeys.length;
			}
		}
	}

	return plan;
}

class ReencryptionAbortError extends Error {
	errors: ReencryptionError[];

	constructor(errors: ReencryptionError[]) {
		super("re-encryption aborted: one or more payloads could not be decrypted");
		this.errors = errors;
	}
}

/**
 * Fail-fast rewrite. Runs the preflight first; any undecryptable payload
 * aborts with zero writes. Otherwise the rewrite runs inside a single
 * transaction, re-planning inside the transaction (so payloads changed
 * mid-run are re-evaluated) and decrypting immediately before each UPDATE.
 */
export async function applyReencryption(
	db: ReencryptionDb,
): Promise<ReencryptionResult> {
	const preflight = await planReencryption(db);
	if (preflight.errors.length > 0) {
		return { ok: false, errors: preflight.errors };
	}

	const activeVersion = getActiveEncryptionKeyVersion();
	let reencrypted = 0;
	const perTableCounts: Record<string, number> = {};

	try {
		await db.transaction(async (tx) => {
			const txPlan = await planReencryption(
				tx as unknown as ReencryptionSelect,
			);
			if (txPlan.errors.length > 0) {
				throw new ReencryptionAbortError(txPlan.errors);
			}

			for (const row of txPlan.stale) {
				switch (row.table) {
					case "ai_providers": {
						const plaintext = decryptSecret(row.payload);
						await tx
							.update(aiProviders)
							.set({
								encryptedApiKey: encryptSecret(plaintext),
								encryptionKeyVersion: activeVersion,
							})
							.where(eq(aiProviders.id, row.id));
						reencrypted += 1;
						perTableCounts["ai_providers"] =
							(perTableCounts["ai_providers"] ?? 0) + 1;
						break;
					}
					case "telegram_configs": {
						const plaintext =
							row.column === "api_server_key"
								? decryptApiServerKey(row.payload)
								: decryptSecret(row.payload);
						const update =
							row.column === "api_server_key"
								? {
										apiServerKey: encryptSecret(plaintext),
										encryptionKeyVersion: activeVersion,
									}
								: {
										botToken: encryptSecret(plaintext),
										encryptionKeyVersion: activeVersion,
									};
						await tx
							.update(telegramConfigs)
							.set(update)
							.where(eq(telegramConfigs.id, row.id));
						reencrypted += 1;
						perTableCounts["telegram_configs"] =
							(perTableCounts["telegram_configs"] ?? 0) + 1;
						break;
					}
					case "servers": {
						const plaintext = decryptSecret(row.payload);
						await tx
							.update(servers)
							.set({ encryptedCredential: encryptSecret(plaintext) })
							.where(eq(servers.id, row.id));
						reencrypted += 1;
						perTableCounts["servers"] = (perTableCounts["servers"] ?? 0) + 1;
						break;
					}
					case "server_web_ui": {
						const plaintext = decryptSecret(row.payload);
						await tx
							.update(serverWebUi)
							.set({ encryptedPassword: encryptSecret(plaintext) })
							.where(eq(serverWebUi.id, row.id));
						reencrypted += 1;
						perTableCounts["server_web_ui"] =
							(perTableCounts["server_web_ui"] ?? 0) + 1;
						break;
					}
					case "mcp_servers": {
						const nextMap = { ...row.map };
						for (const key of row.staleKeys) {
							const entry = row.map[key];
							nextMap[key] = {
								encrypted: encryptSecret(decryptSecret(entry.encrypted)),
								last4: entry.last4,
							};
						}
						if (row.column === "encrypted_env") {
							await tx
								.update(mcpServers)
								.set({ encryptedEnv: nextMap })
								.where(eq(mcpServers.id, row.id));
						} else {
							await tx
								.update(mcpServers)
								.set({ encryptedHeaders: nextMap })
								.where(eq(mcpServers.id, row.id));
						}
						reencrypted += row.staleKeys.length;
						perTableCounts["mcp_servers"] =
							(perTableCounts["mcp_servers"] ?? 0) + row.staleKeys.length;
						break;
					}
				}
			}
		});
	} catch (error) {
		if (error instanceof ReencryptionAbortError) {
			return { ok: false, errors: error.errors };
		}
		throw error;
	}

	return { ok: true, reencrypted, perTableCounts };
}
