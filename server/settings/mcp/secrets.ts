import { decryptSecret, encryptSecret } from "#server/crypto";
import { getLast4 } from "#server/lib/get-last-4";
import type { EncryptedSecretMap } from "./types";

export type SecretKeySummary = {
	key: string;
	valueLast4: string | null;
	hasStoredValue: boolean;
};

export type SecretKeyInput = {
	key: string;
	value: string;
};

export function encryptSecretMap(
	entries: SecretKeyInput[],
): EncryptedSecretMap {
	const result: EncryptedSecretMap = {};

	for (const { key, value } of entries) {
		const trimmedKey = key.trim();
		const trimmedValue = value.trim();
		if (!trimmedKey || !trimmedValue) {
			continue;
		}

		result[trimmedKey] = {
			encrypted: encryptSecret(trimmedValue),
			last4: getLast4(trimmedValue) ?? "",
		};
	}

	return result;
}

export function decryptSecretMap(
	map: EncryptedSecretMap,
): Record<string, string> {
	const result: Record<string, string> = {};

	for (const [key, entry] of Object.entries(map)) {
		result[key] = decryptSecret(entry.encrypted);
	}

	return result;
}

export function resolveSecretMapOnUpdate(
	existing: EncryptedSecretMap,
	updates: SecretKeyInput[],
): EncryptedSecretMap {
	const result: EncryptedSecretMap = {};

	for (const { key, value } of updates) {
		const trimmedKey = key.trim();
		if (!trimmedKey) {
			continue;
		}

		const trimmedValue = value.trim();
		if (trimmedValue) {
			result[trimmedKey] = {
				encrypted: encryptSecret(trimmedValue),
				last4: getLast4(trimmedValue) ?? "",
			};
			continue;
		}

		if (existing[trimmedKey]) {
			result[trimmedKey] = existing[trimmedKey];
		}
	}

	return result;
}

export function toSecretKeySummaries(
	map: EncryptedSecretMap,
): SecretKeySummary[] {
	return Object.entries(map).map(([key, entry]) => ({
		key,
		valueLast4: entry.last4 || null,
		hasStoredValue: true,
	}));
}

export function validateUpdatedSecretEntries(
	existing: EncryptedSecretMap,
	updates: SecretKeyInput[],
	label: string,
): { ok: true } | { ok: false; error: string } {
	for (const { key, value } of updates) {
		const trimmedKey = key.trim();
		if (!trimmedKey) {
			continue;
		}

		if (!value.trim() && !existing[trimmedKey]) {
			return {
				ok: false,
				error: `${label} value is required for new key "${trimmedKey}".`,
			};
		}
	}

	return { ok: true };
}

export function validateNewSecretEntries(
	entries: SecretKeyInput[],
	label: string,
): { ok: true } | { ok: false; error: string } {
	for (const { key, value } of entries) {
		const trimmedKey = key.trim();
		if (!trimmedKey) {
			continue;
		}

		if (!value.trim()) {
			return {
				ok: false,
				error: `${label} value is required for key "${trimmedKey}".`,
			};
		}
	}

	return { ok: true };
}
