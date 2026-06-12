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
			access: "oauth",
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
			access: "oauth",
			subscriptionProvider: "chatgpt",
			model: "gpt-5.4-mini",
			hermesProviderId: "openai-codex",
		});
	});

	it("maps active credential subscription storage rows to subscription backends", () => {
		const backend = deriveActiveModelBackend(null, {
			provider: "mimo",
			model: "mimo-v2.5-pro",
			encryptedApiKey: "encrypted-key",
			baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
			isActive: true,
		});

		expect(backend).toMatchObject({
			kind: "subscription",
			access: "credential",
			subscriptionProvider: "mimo",
			model: "mimo-v2.5-pro",
			authMode: "mimo-token-plan",
			hermesProviderId: "xiaomi",
			storageProviderId: "mimo",
			encryptedApiKey: "encrypted-key",
			baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
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
