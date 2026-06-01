import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	fingerprintFromKeyHex,
	isValidSha256HostKeyFingerprint,
} from "./host-key-fingerprint";

const keyHex =
	"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
const validFingerprint = `SHA256:${createHash("sha256").update(Buffer.from(keyHex, "hex")).digest("base64")}`;

describe("host key fingerprint helpers", () => {
	it("accepts OpenSSH SHA256 fingerprints", () => {
		expect(isValidSha256HostKeyFingerprint(validFingerprint)).toBe(true);
	});

	it("rejects malformed fingerprints", () => {
		expect(isValidSha256HostKeyFingerprint("SHA256:newkey")).toBe(false);
		expect(isValidSha256HostKeyFingerprint("MD5:abcd")).toBe(false);
	});

	it("derives fingerprints from ssh2 key hex", () => {
		expect(fingerprintFromKeyHex(keyHex, "ssh-ed25519")).toEqual({
			fingerprint: validFingerprint,
			algorithm: "ssh-ed25519",
		});
	});
});
