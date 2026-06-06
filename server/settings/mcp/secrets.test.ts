import { beforeEach, describe, expect, it, vi } from "vitest";

const { encryptSecret, decryptSecret } = vi.hoisted(() => ({
	encryptSecret: vi.fn(),
	decryptSecret: vi.fn(),
}));

vi.mock("../../crypto", () => ({
	encryptSecret,
	decryptSecret,
}));

import {
	encryptSecretMap,
	resolveSecretMapOnUpdate,
	toSecretKeySummaries,
	validateNewSecretEntries,
	validateUpdatedSecretEntries,
} from "./secrets";

describe("mcp secrets", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		encryptSecret.mockImplementation((value: string) => `enc:${value}`);
		decryptSecret.mockImplementation((value: string) =>
			value.replace("enc:", ""),
		);
	});

	it("encrypts non-empty secret rows", () => {
		const map = encryptSecretMap([
			{ key: "GITHUB_TOKEN", value: "ghp_secret1234" },
			{ key: "", value: "ignored" },
		]);

		expect(map).toEqual({
			GITHUB_TOKEN: {
				encrypted: "enc:ghp_secret1234",
				last4: "1234",
			},
		});
	});

	it("preserves stored secrets when update values are blank", () => {
		const existing = {
			GITHUB_TOKEN: {
				encrypted: "enc:ghp_secret1234",
				last4: "1234",
			},
		};

		const resolved = resolveSecretMapOnUpdate(existing, [
			{ key: "GITHUB_TOKEN", value: "" },
		]);

		expect(resolved).toEqual(existing);
	});

	it("drops removed secret keys on update", () => {
		const existing = {
			GITHUB_TOKEN: {
				encrypted: "enc:ghp_secret1234",
				last4: "1234",
			},
			OLD_KEY: {
				encrypted: "enc:old",
				last4: "dkey",
			},
		};

		const resolved = resolveSecretMapOnUpdate(existing, [
			{ key: "GITHUB_TOKEN", value: "" },
		]);

		expect(resolved).toEqual({
			GITHUB_TOKEN: existing.GITHUB_TOKEN,
		});
	});

	it("returns masked summaries without secret values", () => {
		const summaries = toSecretKeySummaries({
			Authorization: {
				encrypted: "enc:Bearer secret",
				last4: "cret",
			},
		});

		expect(summaries).toEqual([
			{
				key: "Authorization",
				valueLast4: "cret",
				hasStoredValue: true,
			},
		]);
	});

	it("requires values for new secret keys", () => {
		const result = validateNewSecretEntries(
			[{ key: "GITHUB_TOKEN", value: "" }],
			"Environment variable",
		);

		expect(result).toEqual({
			ok: false,
			error: 'Environment variable value is required for key "GITHUB_TOKEN".',
		});
	});

	it("allows blank values for existing secret keys on update", () => {
		const result = validateUpdatedSecretEntries(
			{
				GITHUB_TOKEN: {
					encrypted: "enc:token",
					last4: "oken",
				},
			},
			[{ key: "GITHUB_TOKEN", value: "" }],
			"Environment variable",
		);

		expect(result).toEqual({ ok: true });
	});

	it("requires values for newly added secret keys on update", () => {
		const result = validateUpdatedSecretEntries(
			{},
			[{ key: "GITHUB_TOKEN", value: "" }],
			"Environment variable",
		);

		expect(result).toEqual({
			ok: false,
			error:
				'Environment variable value is required for new key "GITHUB_TOKEN".',
		});
	});
});
