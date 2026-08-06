import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	decryptApiServerKey,
	decryptSecret,
	encryptSecret,
	getActiveEncryptionKeyVersion,
} from "./crypto";
import { logger } from "./lib/logger";

vi.mock("./lib/logger", () => ({
	logger: { warn: vi.fn() },
}));

describe("crypto", () => {
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
	describe("encryptSecret / decryptSecret", () => {
		it("decrypts a legacy unversioned payload with the v1 key", () => {
			// Payloads written before key versioning have no vN prefix; they
			// must still decrypt as v1 for full backward compatibility.
			// Strip the v1. prefix from a fresh payload to simulate one.
			expect(decryptSecret(encryptSecret("x").slice(3))).toBe("x");
		});

		it("round-trips a simple value", () => {
			expect(decryptSecret(encryptSecret("hunter2"))).toBe("hunter2");
		});

		it("round-trips a long value", () => {
			const long = "x".repeat(1024);
			expect(decryptSecret(encryptSecret(long))).toBe(long);
		});

		it("round-trips unicode", () => {
			const unicode = "🔐 secret passphrase 日本語";
			expect(decryptSecret(encryptSecret(unicode))).toBe(unicode);
		});

		it("produces a versioned, four dot-separated payload", () => {
			const parts = encryptSecret("x").split(".");
			expect(parts).toHaveLength(4);
			// The first segment is the literal key version; the rest are the
			// iv, authTag, and cipher as base64url.
			expect(parts[0]).toBe("v1");
			for (const part of parts.slice(1)) {
				expect(part.length).toBeGreaterThan(0);
			}
		});

		it("produces distinct ciphertexts for the same input", () => {
			const a = encryptSecret("x");
			const b = encryptSecret("x");
			expect(a).not.toBe(b);
		});

		it("rejects a tampered auth tag", () => {
			const payload = encryptSecret("secret");
			const parts = payload.split(".");
			const tag = parts[2];
			const tampered = tag === "A" ? "B" : "A";
			const tamperedPayload = [parts[0], parts[1], tampered, parts[3]].join(
				".",
			);
			expect(() => decryptSecret(tamperedPayload)).toThrow();
		});

		it("throws on a payload with fewer than 3 parts", () => {
			expect(() => decryptSecret("only.two")).toThrow(
				/Encrypted payload is invalid/,
			);
		});

		it("rejects a truncated versioned payload instead of falling back to legacy", () => {
			// A 3-part payload whose first segment is a version prefix is a
			// truncated vN payload, not a legacy iv.tag.cipher payload.
			expect(() => decryptSecret("v1.a.b")).toThrow(
				/Encrypted payload is invalid/,
			);
		});

		it("throws when ENCRYPTION_KEY is unset", () => {
			delete process.env.ENCRYPTION_KEY;
			expect(() => encryptSecret("x")).toThrow(/ENCRYPTION_KEY is required/);
		});

		it("still decrypts v1 payloads when ENCRYPTION_KEY_V2 is added", () => {
			const legacyPayload = encryptSecret("before-rotation");

			vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");

			// The v1 key remains in the ring, so old rows keep decrypting.
			expect(decryptSecret(legacyPayload)).toBe("before-rotation");
		});

		it("uses v2 for new writes when ENCRYPTION_KEY_V2 is set", () => {
			vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");

			const payload = encryptSecret("after-rotation");
			expect(payload.startsWith("v2.")).toBe(true);
			expect(decryptSecret(payload)).toBe("after-rotation");
		});

		it("decrypts a v1 payload written before rotation while v2 is active", () => {
			const v1Payload = encryptSecret("old-row");

			vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");

			// v1 prefix explicitly selects the legacy key from the ring.
			expect(v1Payload.startsWith("v1.")).toBe(true);
			expect(decryptSecret(v1Payload)).toBe("old-row");
		});

		it("throws when a payload references an unknown key version", () => {
			const payload = encryptSecret("x");
			const parts = payload.split(".");
			const unknownVersion = ["v9", ...parts.slice(1)].join(".");

			expect(() => decryptSecret(unknownVersion)).toThrow(
				/No encryption key registered for version v9/,
			);
		});
	});
	describe("decryptApiServerKey", () => {
		beforeEach(() => {
			vi.mocked(logger.warn).mockClear();
		});

		it("returns empty string for empty input", () => {
			expect(decryptApiServerKey("")).toBe("");
		});

		it("returns the active encryption key version from the keyring", () => {
			expect(getActiveEncryptionKeyVersion()).toBe("v1");

			vi.stubEnv("ENCRYPTION_KEY_V2", "new-encryption-key");
			expect(getActiveEncryptionKeyVersion()).toBe("v2");
		});

		it("throws for legacy plaintext without a dot instead of returning it", () => {
			expect(() => decryptApiServerKey("legacy-plaintext-key")).toThrow(
				/legacy plaintext/,
			);
			expect(logger.warn).toHaveBeenCalledWith(
				expect.objectContaining({ kind: "decrypt" }),
				expect.stringContaining("legacy plaintext"),
			);
		});

		it("round-trips an encrypted value", () => {
			expect(decryptApiServerKey(encryptSecret("k"))).toBe("k");
		});

		it("throws for malformed value containing a dot", () => {
			// Two-part payloads are rejected by decryptSecret's shape check.
			expect(() => decryptApiServerKey("only.two")).toThrow(
				/Encrypted payload is invalid/,
			);

			// Three-part garbage decodes to invalid ciphertext material.
			expect(() => decryptApiServerKey("a.b.c")).toThrow();
		});
	});
});
