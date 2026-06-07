import { describe, expect, it } from "vitest";

import { deriveActiveModelBackend } from "./active-backend";

describe("deriveActiveModelBackend", () => {
	it("prefers an active subscription over an active API provider", () => {
		const backend = deriveActiveModelBackend(
			{
				subscriptionProvider: "chatgpt",
				model: "gpt-5.4-mini",
				authMode: "chatgpt",
				isActive: true,
			},
			{
				provider: "openai",
				model: "gpt-4o",
				encryptedApiKey: "encrypted-key",
				baseUrl: null,
				isActive: true,
			},
		);

		expect(backend).toMatchObject({
			kind: "subscription",
			subscriptionProvider: "chatgpt",
			model: "gpt-5.4-mini",
			hermesProviderId: "openai-codex",
		});
	});

	it("maps legacy openai-codex provider rows to ChatGPT subscription backends", () => {
		const backend = deriveActiveModelBackend(null, {
			provider: "openai-codex",
			model: "gpt-5.4-mini",
			encryptedApiKey: "corrupt-ciphertext",
			baseUrl: null,
			isActive: true,
		});

		expect(backend).toMatchObject({
			kind: "subscription",
			subscriptionProvider: "chatgpt",
			model: "gpt-5.4-mini",
			hermesProviderId: "openai-codex",
		});
	});

	it("returns null when no active subscription or API provider exists", () => {
		expect(
			deriveActiveModelBackend(null, {
				provider: "openai",
				model: "gpt-4o",
				encryptedApiKey: "encrypted-key",
				baseUrl: null,
				isActive: false,
			}),
		).toBeNull();
	});
});
