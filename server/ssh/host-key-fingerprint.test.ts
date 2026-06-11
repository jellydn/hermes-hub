import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildEd25519WireKey } from "./__tests__/build-ed25519-wire-key";
import {
	fingerprintFromKeyBuffer,
	isValidSha256HostKeyFingerprint,
} from "./host-key-fingerprint";

const wireKey = buildEd25519WireKey();
const validFingerprint = `SHA256:${createHash("sha256")
	.update(wireKey)
	.digest("base64")
	.replace(/=+$/, "")}`;

describe("host key fingerprint helpers", () => {
	it("accepts OpenSSH SHA256 fingerprints", () => {
		expect(isValidSha256HostKeyFingerprint(validFingerprint)).toBe(true);
	});

	it("rejects malformed fingerprints", () => {
		expect(isValidSha256HostKeyFingerprint("SHA256:newkey")).toBe(false);
		expect(isValidSha256HostKeyFingerprint("MD5:abcd")).toBe(false);
	});

	it("accepts both padded and no-padding SHA256 fingerprints", () => {
		const noPadding = validFingerprint;
		const padded = `${validFingerprint}=`;
		expect(isValidSha256HostKeyFingerprint(noPadding)).toBe(true);
		expect(isValidSha256HostKeyFingerprint(padded)).toBe(true);
	});

	it("derives a fingerprint from a raw ssh2 host-key buffer", () => {
		const result = fingerprintFromKeyBuffer(wireKey);
		expect(result.fingerprint).toBe(validFingerprint);
		expect(result.algorithm).toBe("ssh-ed25519");
	});

	it("falls back to the provided algorithm when wire format is unparseable", () => {
		const opaque = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x00]);
		const result = fingerprintFromKeyBuffer(opaque, "ssh-rsa");
		expect(result.fingerprint.startsWith("SHA256:")).toBe(true);
		expect(result.algorithm).toBe("ssh-rsa");
	});
});
