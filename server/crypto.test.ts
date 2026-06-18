import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptApiServerKey, decryptSecret, encryptSecret } from "./crypto";

describe("crypto", () => {
	const originalEnv = process.env.ENCRYPTION_KEY;

	beforeEach(() => {
		process.env.ENCRYPTION_KEY = "test-encryption-key";
	});

	afterEach(() => {
		if (originalEnv === undefined) {
			delete process.env.ENCRYPTION_KEY;
		} else {
			process.env.ENCRYPTION_KEY = originalEnv;
		}
	});

	describe("encryptSecret / decryptSecret", () => {
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

		it("produces three dot-separated base64url parts", () => {
			const parts = encryptSecret("x").split(".");
			expect(parts).toHaveLength(3);
			for (const part of parts) {
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
			const tag = parts[1];
			const tampered = tag === "A" ? "B" : "A";
			const tamperedPayload = [parts[0], tampered, parts[2]].join(".");
			expect(() => decryptSecret(tamperedPayload)).toThrow();
		});

		it("throws on a payload with fewer than 3 parts", () => {
			expect(() => decryptSecret("only.two")).toThrow(
				/Encrypted payload is invalid/,
			);
		});

		it("throws when ENCRYPTION_KEY is unset", () => {
			delete process.env.ENCRYPTION_KEY;
			expect(() => encryptSecret("x")).toThrow(/ENCRYPTION_KEY is required/);
		});
	});

	describe("decryptApiServerKey", () => {
		it("returns empty string for empty input", () => {
			expect(decryptApiServerKey("")).toBe("");
		});

		it("round-trips an encrypted value", () => {
			expect(decryptApiServerKey(encryptSecret("k"))).toBe("k");
		});

		// Plan 005: the silent "decrypt to plaintext when no dot is present"
		// fallback was removed. Legacy plaintext columns now surface as a
		// thrown error so operators see the read fail rather than have an
		// attacker-controlled string stand in for a credential.
		it("throws for legacy plaintext input without a dot", () => {
			expect(() => decryptApiServerKey("legacy-plaintext-key")).toThrow(
				/API server key is in legacy plaintext format/,
			);
		});

		// Plan 005: malformed AES-GCM payloads now propagate the original
		// decrypt error rather than the (now removed) friendly wrapper, so
		// debugging points at the real failure mode.
		it("rethrows the underlying error for malformed AES-GCM payloads", () => {
			expect(() => decryptApiServerKey("a.b.c")).toThrow();
		});
	});
});
