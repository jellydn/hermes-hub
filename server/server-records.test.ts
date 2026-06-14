import { beforeEach, describe, expect, it, vi } from "vitest";

const decryptSecret = vi.hoisted(() => vi.fn());
const getSessionCredential = vi.hoisted(() => vi.fn());

vi.mock("./crypto", () => ({ decryptSecret }));
vi.mock("./credentials", () => ({ getSessionCredential }));

import {
	normalizeAuthMethod,
	resolveServerCredential,
	resolveServerSshConfig,
	resolveServerSshConfigOrError,
} from "./server-records";

describe("resolveServerCredential", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns decrypted stored credential when storeCredential is true", () => {
		decryptSecret.mockReturnValue("decrypted-password");
		const result = resolveServerCredential(
			{
				id: "s1",
				encryptedCredential: "enc-blob",
				storeCredential: true,
			},
			"session_1",
		);
		expect(result).toBe("decrypted-password");
		expect(decryptSecret).toHaveBeenCalledWith("enc-blob");
	});

	it("throws when storeCredential is true but encryptedCredential is null", () => {
		expect(() =>
			resolveServerCredential(
				{
					id: "s1",
					encryptedCredential: null,
					storeCredential: true,
				},
				"session_1",
			),
		).toThrow(/Stored credential is missing/);
	});

	it("throws when storeCredential is false and no sessionId", () => {
		expect(() =>
			resolveServerCredential({
				id: "s1",
				encryptedCredential: null,
				storeCredential: false,
			}),
		).toThrow(/Temporary credential expired/);
	});

	it("throws when storeCredential is false and session credential expired", () => {
		getSessionCredential.mockReturnValue(undefined);
		expect(() =>
			resolveServerCredential(
				{
					id: "s1",
					encryptedCredential: null,
					storeCredential: false,
				},
				"session_1",
			),
		).toThrow(/Temporary credential expired/);
		expect(getSessionCredential).toHaveBeenCalledWith("s1", "session_1");
	});

	it("returns ephemeral credential when session credential is valid", () => {
		getSessionCredential.mockReturnValue({ credential: "ephemeral-key" });
		const result = resolveServerCredential(
			{
				id: "s1",
				encryptedCredential: null,
				storeCredential: false,
			},
			"session_1",
		);
		expect(result).toBe("ephemeral-key");
		expect(getSessionCredential).toHaveBeenCalledWith("s1", "session_1");
	});
});

describe("normalizeAuthMethod", () => {
	it("returns password for password", () => {
		expect(normalizeAuthMethod("password")).toBe("password");
	});

	it("returns ssh-key for ssh-key", () => {
		expect(normalizeAuthMethod("ssh-key")).toBe("ssh-key");
	});

	it("returns null for unsupported method", () => {
		expect(normalizeAuthMethod("gssapi")).toBeNull();
	});
});

describe("resolveServerSshConfig", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("throws for unsupported auth method", () => {
		expect(() =>
			resolveServerSshConfig({
				id: "s1",
				authMethod: "gssapi",
				host: "1.2.3.4",
				port: 22,
				username: "root",
				encryptedCredential: null,
				storeCredential: false,
			}),
		).toThrow(/Unsupported authentication method/);
	});

	it("returns config for valid stored password", () => {
		decryptSecret.mockReturnValue("decrypted");
		const result = resolveServerSshConfig({
			id: "s1",
			authMethod: "password",
			host: "1.2.3.4",
			port: 22,
			username: "root",
			encryptedCredential: "enc",
			storeCredential: true,
		});
		expect(result).toEqual({
			authMethod: "password",
			credential: "decrypted",
		});
	});
});

describe("resolveServerSshConfigOrError", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns ok: true on success", () => {
		decryptSecret.mockReturnValue("cred");
		const result = resolveServerSshConfigOrError(
			{
				id: "s1",
				authMethod: "ssh-key",
				host: "1.2.3.4",
				port: 22,
				username: "root",
				encryptedCredential: "enc",
				storeCredential: true,
			},
			"session_1",
		);
		expect(result).toEqual({
			ok: true,
			authMethod: "ssh-key",
			credential: "cred",
		});
	});

	it("returns ok: false on failure", () => {
		const result = resolveServerSshConfigOrError(
			{
				id: "s1",
				authMethod: "password",
				host: "1.2.3.4",
				port: 22,
				username: "root",
				encryptedCredential: null,
				storeCredential: true,
			},
			"session_1",
		);
		expect(result).toEqual({
			ok: false,
			error: "Stored credential is missing.",
		});
	});
});
