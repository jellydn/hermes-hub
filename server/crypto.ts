import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

import { logger } from "./lib/logger";

const algorithm = "aes-256-gcm";
const ivLength = 12;

const LEGACY_ENCRYPTION_VERSION = "v1";
const VERSIONED_PREFIX_PATTERN = /^v\d+$/;

type KeyringEntry = {
	version: string;
	key: Buffer;
};

type Keyring = {
	active: KeyringEntry;
	all: KeyringEntry[];
};

function deriveKey(rawKey: string): Buffer {
	return createHash("sha256").update(rawKey).digest();
}

/**
 * Build the keyring from env. `ENCRYPTION_KEY` is always the legacy `v1`
 * key. `ENCRYPTION_KEY_V2` is optional; when present it becomes the active
 * key for new writes while the v1 key stays in the ring so existing rows
 * continue to decrypt. This makes rotation a config-only operation.
 */
function buildKeyringFromEnv(): Keyring {
	const legacyKey = process.env.ENCRYPTION_KEY;

	if (!legacyKey) {
		throw new Error("ENCRYPTION_KEY is required");
	}

	const entries: KeyringEntry[] = [
		{ version: LEGACY_ENCRYPTION_VERSION, key: deriveKey(legacyKey) },
	];

	const nextKey = process.env.ENCRYPTION_KEY_V2;
	if (nextKey) {
		entries.push({ version: "v2", key: deriveKey(nextKey) });
	}

	return { active: entries[entries.length - 1], all: entries };
}

// Cached keyring keyed on the env snapshot so tests can swap
// ENCRYPTION_KEY_V2 via vi.stubEnv without sharing stale state between
// cases, while production rebuilds only when the env actually changes.
let cachedKeyring: { envSnapshot: string; ring: Keyring } | null = null;

function getKeyring(): Keyring {
	const envSnapshot = JSON.stringify([
		process.env.ENCRYPTION_KEY ?? "",
		process.env.ENCRYPTION_KEY_V2 ?? "",
	]);

	if (!cachedKeyring || cachedKeyring.envSnapshot !== envSnapshot) {
		cachedKeyring = { envSnapshot, ring: buildKeyringFromEnv() };
	}

	return cachedKeyring.ring;
}

/**
 * Version of the active key — persisted next to newly encrypted payloads so
 * the future re-encryption runner can tell which key each row was written with.
 */
export function getActiveEncryptionKeyVersion(): string {
	return getKeyring().active.version;
}

export function encryptSecret(value: string) {
	const { active } = getKeyring();
	const iv = randomBytes(ivLength);
	const cipher = createCipheriv(algorithm, active.key, iv);
	const encrypted = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	// Wire format: vN.<iv>.<authTag>.<cipher> (base64url, dot-joined).
	return [
		active.version,
		[iv, authTag, encrypted]
			.map((part) => part.toString("base64url"))
			.join("."),
	].join(".");
}

export function decryptSecret(payload: string) {
	const { key, parts } = parsePayload(payload);
	const [ivEncoded, authTagEncoded, encryptedEncoded] = parts;

	if (!ivEncoded || !authTagEncoded || !encryptedEncoded) {
		throw new Error("Encrypted payload is invalid");
	}

	const decipher = createDecipheriv(
		algorithm,
		key,
		Buffer.from(ivEncoded, "base64url"),
	);

	decipher.setAuthTag(Buffer.from(authTagEncoded, "base64url"));

	return Buffer.concat([
		decipher.update(Buffer.from(encryptedEncoded, "base64url")),
		decipher.final(),
	]).toString("utf8");
}

/**
 * Resolve the key and the iv/authTag/cipher segments for a payload.
 *
 * - `vN.iv.authTag.cipher` selects the key for version `vN`.
 * - The legacy `iv.authTag.cipher` format (no prefix) is treated as `v1`
 *   for full backward compatibility with payloads written before versioning.
 */
function parsePayload(payload: string): {
	key: Buffer;
	parts: [string, string, string];
} {
	const allParts = payload.split(".");

	if (allParts.length === 4 && VERSIONED_PREFIX_PATTERN.test(allParts[0])) {
		const version = allParts[0];
		const entry = getKeyring().all.find(
			(candidate) => candidate.version === version,
		);

		if (!entry) {
			throw new Error(`No encryption key registered for version ${version}`);
		}

		return {
			key: entry.key,
			parts: [allParts[1], allParts[2], allParts[3]],
		};
	}

	if (allParts.length === 3) {
		// A truncated versioned payload (e.g. "v1.a.b") must not fall through
		// to the legacy branch — its first segment is a version, not an IV.
		if (VERSIONED_PREFIX_PATTERN.test(allParts[0])) {
			throw new Error("Encrypted payload is invalid");
		}

		const legacy = getKeyring().all.find(
			(candidate) => candidate.version === LEGACY_ENCRYPTION_VERSION,
		);

		if (!legacy) {
			throw new Error("ENCRYPTION_KEY is required");
		}

		return { key: legacy.key, parts: [allParts[0], allParts[1], allParts[2]] };
	}

	throw new Error("Encrypted payload is invalid");
}

export function decryptApiServerKey(payload: string): string {
	if (!payload) {
		return "";
	}
	try {
		return decryptSecret(payload);
	} catch (error) {
		// Legacy unencrypted keys don't have the AES-GCM iv:tag:cipher structure.
		// Refuse to treat plaintext as a credential instead of silently returning
		// it — operators must re-save the provider so the value is encrypted.
		if (!payload.includes(".")) {
			logger.warn(
				{ kind: "decrypt", payloadLength: payload.length },
				"decryptApiServerKey received a legacy plaintext API server key — refusing to use as credential",
			);
			throw new Error(
				"API server key is in legacy plaintext format and cannot be decrypted; the operator must re-save it via /api/providers.",
			);
		}
		throw error;
	}
}
