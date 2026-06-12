import { describe, expect, it } from "vitest";

import { apiProviderOptions } from "./ai-providers";
import {
	getSubscriptionByStorageProviderId,
	getSubscriptionDefaultBaseUrl,
	getSubscriptionStorageProviderId,
	getUserSubscriptionOption,
	isValidSubscriptionModel,
	subscriptionRequiresCredentials,
	userSubscriptionOptions,
} from "./user-subscriptions";

describe("api provider options", () => {
	it("does not expose openai-codex as an API provider option", () => {
		expect(apiProviderOptions.map((option) => option.id)).not.toContain(
			"openai-codex",
		);
	});
});

describe("chatgpt subscription metadata", () => {
	it("exposes ChatGPT models including gpt-5.4-mini", () => {
		const option = getUserSubscriptionOption("chatgpt");

		expect(option).toMatchObject({
			label: "ChatGPT",
			hermesProviderId: "openai-codex",
			authMode: "chatgpt",
			credentialKind: "oauth",
			defaultModel: "gpt-5.5",
			models: expect.arrayContaining(["gpt-5.4-mini", "gpt-5.5"]),
		});
	});

	it("accepts only whitelisted ChatGPT models", () => {
		expect(isValidSubscriptionModel("chatgpt", "gpt-5.4-mini")).toBe(true);
		expect(isValidSubscriptionModel("chatgpt", "gpt-5.3-codex-spark")).toBe(
			true,
		);
		expect(isValidSubscriptionModel("chatgpt", "gpt-4o")).toBe(false);
	});
});

describe("mimo subscription metadata", () => {
	it("exposes MiMo Token Plan models and deploy metadata", () => {
		const option = getUserSubscriptionOption("mimo");

		expect(option).toMatchObject({
			label: "Xiaomi MiMo Token Plan",
			hermesProviderId: "xiaomi",
			authMode: "mimo-token-plan",
			credentialKind: "api-key",
			storageProviderId: "mimo",
			defaultModel: "mimo-v2.5-pro",
			defaultBaseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
			deployEnv: {
				apiKeyEnvVar: "XIAOMI_API_KEY",
				baseUrlEnvVar: "XIAOMI_BASE_URL",
			},
			models: ["mimo-v2.5-pro", "mimo-v2.5"],
		});
	});

	it("accepts only whitelisted MiMo models", () => {
		expect(isValidSubscriptionModel("mimo", "mimo-v2.5-pro")).toBe(true);
		expect(isValidSubscriptionModel("mimo", "mimo-v2.5")).toBe(true);
		expect(isValidSubscriptionModel("mimo", "gpt-4o")).toBe(false);
	});

	it("maps storage provider ids back to subscription options", () => {
		expect(getSubscriptionByStorageProviderId("mimo")?.id).toBe("mimo");
		expect(getSubscriptionStorageProviderId("mimo")).toBe("mimo");
		expect(getSubscriptionDefaultBaseUrl("mimo")).toBe(
			"https://token-plan-cn.xiaomimimo.com/v1",
		);
		expect(subscriptionRequiresCredentials("mimo")).toBe(true);
		expect(subscriptionRequiresCredentials("chatgpt")).toBe(false);
	});
});

describe("user subscription options", () => {
	it("lists ChatGPT and MiMo in user subscription options", () => {
		expect(userSubscriptionOptions.map((option) => option.id)).toEqual([
			"chatgpt",
			"mimo",
		]);
	});
});
