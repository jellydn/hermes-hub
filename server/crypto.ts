import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

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
	} catch {
		// Legacy unencrypted keys don't have the AES-GCM iv:tag:cipher structure
		if (!payload.includes(".")) {
			return payload;
		}
		throw new Error("API server key could not be decrypted.");
	}
}
