import { createHash } from "node:crypto";

export type HostKeyFingerprint = {
	fingerprint: string;
	algorithm: string;
};

const SHA256_FINGERPRINT_PATTERN = /^SHA256:[A-Za-z0-9+/]{43}=?$/;
const DEFAULT_HOST_KEY_ALGORITHM = "ssh-ed25519";
const MAX_ALGORITHM_NAME_LENGTH = 64;

export const INVALID_FINGERPRINT_MESSAGE =
	"Fingerprint must be a SHA256-prefixed OpenSSH fingerprint (SHA256: followed by 43 base64 characters, optionally padded with '=').";

export function isValidSha256HostKeyFingerprint(value: string): boolean {
	return SHA256_FINGERPRINT_PATTERN.test(value);
}

export function fingerprintFromKeyBuffer(
	keyBuffer: Buffer,
	fallbackAlgorithm: string = DEFAULT_HOST_KEY_ALGORITHM,
): HostKeyFingerprint {
	const rawBase64 = createHash("sha256").update(keyBuffer).digest("base64");
	const fingerprint = `SHA256:${rawBase64.replace(/=+$/, "")}`;
	return {
		fingerprint,
		algorithm: parseSshKeyAlgorithm(keyBuffer) ?? fallbackAlgorithm,
	};
}

function parseSshKeyAlgorithm(keyBuffer: Buffer): string | null {
	if (keyBuffer.length < 4) {
		return null;
	}

	const algoNameLength = keyBuffer.readUInt32BE(0);
	if (algoNameLength <= 0 || algoNameLength > MAX_ALGORITHM_NAME_LENGTH) {
		return null;
	}

	if (keyBuffer.length < 4 + algoNameLength) {
		return null;
	}

	const algoName = keyBuffer.subarray(4, 4 + algoNameLength).toString("ascii");
	return /^[a-z0-9-]+$/.test(algoName) ? algoName : null;
}
