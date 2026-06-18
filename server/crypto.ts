import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

import { logger } from "./lib/logger";

const algorithm = "aes-256-gcm";
const ivLength = 12;

function getEncryptionKey() {
	const rawKey = process.env.ENCRYPTION_KEY;

	if (!rawKey) {
		throw new Error("ENCRYPTION_KEY is required");
	}

	return createHash("sha256").update(rawKey).digest();
}

export function encryptSecret(value: string) {
	const iv = randomBytes(ivLength);
	const cipher = createCipheriv(algorithm, getEncryptionKey(), iv);
	const encrypted = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	return [iv, authTag, encrypted]
		.map((part) => part.toString("base64url"))
		.join(".");
}

export function decryptSecret(payload: string) {
	const [ivEncoded, authTagEncoded, encryptedEncoded] = payload.split(".");

	if (!ivEncoded || !authTagEncoded || !encryptedEncoded) {
		throw new Error("Encrypted payload is invalid");
	}

	const decipher = createDecipheriv(
		algorithm,
		getEncryptionKey(),
		Buffer.from(ivEncoded, "base64url"),
	);

	decipher.setAuthTag(Buffer.from(authTagEncoded, "base64url"));

	return Buffer.concat([
		decipher.update(Buffer.from(encryptedEncoded, "base64url")),
		decipher.final(),
	]).toString("utf8");
}

export function decryptApiServerKey(payload: string): string {
	if (!payload) {
		return "";
	}
	try {
		return decryptSecret(payload);
	} catch (err) {
		// Legacy plaintext values have no AES-GCM `iv:tag:cipher` structure.
		// The pre-fix code silently returned the plaintext — that masked
		// corrupted bytes, crafted SQL rows, and accidental non-key
		// strings. Surface the read instead as an operator-actionable
		// error so the next migration step (hard rejection of plaintext)
		// can land without unbounded blast radius.
		//
		// NB: every current call-site turns this throw into an
		// operator-visible failure path rather than a silent "" substitute:
		//   - server/providers/records.ts: catches and returns { ok: false }
		//     (existing pre-fix wrapper).
		//   - server/server-compose.ts: prepends the error.message onto a
		//     "Failed to decrypt Telegram deploy secrets: ..." so the
		//     actionable plaintext hint is preserved through the wrap.
		//   - server/telegram.ts:testTelegramBot and
		//     server/deploy.ts:deployProviderToHermes: catch the throw and
		//     return 502 with error.message (plan 005 follow-up so the
		//     response is operator-actionable rather than a 500 from Hono's
		//     default error handler).
		if (!payload.includes(".")) {
			logger.warn(
				{
					kind: "decrypt",
					payloadLength: payload.length,
				},
				"decryptApiServerKey received a legacy plaintext API server key — refusing to use as credential; the operator must re-save the provider via /api/providers.",
			);
			throw new Error(
				"API server key is in legacy plaintext format and cannot be decrypted; the operator must re-save it via /api/providers.",
			);
		}
		throw err;
	}
}
