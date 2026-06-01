import { createHash } from "node:crypto";

export type HostKeyFingerprint = {
	fingerprint: string;
	algorithm: string;
};

const SHA256_FINGERPRINT_PATTERN = /^SHA256:[A-Za-z0-9+/]{43}=?$/;

export function isValidSha256HostKeyFingerprint(value: string): boolean {
	return SHA256_FINGERPRINT_PATTERN.test(value);
}

export function fingerprintFromKeyHex(
	keyHex: string,
	algorithm = "unknown",
): HostKeyFingerprint {
	const keyBytes = Buffer.from(keyHex, "hex");
	return {
		fingerprint: `SHA256:${createHash("sha256").update(keyBytes).digest("base64")}`,
		algorithm,
	};
}
