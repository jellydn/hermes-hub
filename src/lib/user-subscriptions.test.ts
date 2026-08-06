import { describe, expect, it } from "vitest";

import { apiProviderOptions } from "./ai-providers";
import {
	getSubscriptionByStorageProviderId,
	getSubscriptionDefaultBaseUrl,
	getSubscriptionStorageProviderId,
	getUserSubscriptionOption,
	isValidSubscriptionModel,
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
	it("exposes current ChatGPT model suggestions", () => {
		const option = getUserSubscriptionOption("chatgpt");

		expect(option).toMatchObject({
			label: "ChatGPT",
			hermesProviderId: "openai-codex",
			authMode: "chatgpt",
			credentialKind: "oauth",
			defaultModel: "gpt-5.6-terra",
			models: [
				"gpt-5.6-sol",
				"gpt-5.6-terra",
				"gpt-5.6-luna",
				"gpt-5.5",
				"gpt-5.5-pro",
				"gpt-5.4-mini",
				"gpt-5.4",
				"gpt-5.3-codex",
				"gpt-5.3-codex-spark",
			],
		});
	});

	it("accepts suggested and custom ChatGPT models", () => {
		expect(isValidSubscriptionModel("chatgpt", "gpt-5.6-terra")).toBe(true);
		expect(isValidSubscriptionModel("chatgpt", "gpt-5.3-codex-spark")).toBe(
			true,
		);
		expect(isValidSubscriptionModel("chatgpt", "gpt-6-preview")).toBe(true);
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

	it("accepts suggested and custom MiMo models", () => {
		expect(isValidSubscriptionModel("mimo", "mimo-v2.5-pro")).toBe(true);
		expect(isValidSubscriptionModel("mimo", "mimo-v2.5")).toBe(true);
		expect(isValidSubscriptionModel("mimo", "gpt-4o")).toBe(true);
	});

	it("maps storage provider ids back to subscription options", () => {
		expect(getSubscriptionByStorageProviderId("mimo")?.id).toBe("mimo");
		expect(getSubscriptionStorageProviderId("mimo")).toBe("mimo");
		expect(getSubscriptionDefaultBaseUrl("mimo")).toBe(
			"https://token-plan-cn.xiaomimimo.com/v1",
		);
		expect(getUserSubscriptionOption("mimo")?.supportsConnectionTest).toBe(
			true,
		);
		expect(getUserSubscriptionOption("chatgpt")?.supportsConnectionTest).toBe(
			false,
		);
	});
});

describe("commandcode subscription metadata", () => {
	it("exposes Command Code Coding Plan models and deploy metadata", () => {
		const option = getUserSubscriptionOption("commandcode");

		expect(option).toMatchObject({
			label: "Command Code Coding Plan",
			hermesProviderId: "custom",
			authMode: "coding-plan",
			credentialKind: "api-key",
			storageProviderId: "commandcode",
			defaultModel: "deepseek/deepseek-v4-flash",
			defaultBaseUrl: "https://api.commandcode.ai/provider/v1",
			deployEnv: {
				apiKeyEnvVar: "COMMANDCODE_API_KEY",
				baseUrlEnvVar: "COMMANDCODE_BASE_URL",
			},
			models: expect.arrayContaining([
				"taste-1",
				"deepseek/deepseek-v4-flash",
				"deepseek/deepseek-v4-pro",
				"minimax/minimax-m3",
				"mimo/mimo-v2.5-pro",
				"mimo/mimo-v2.5",
			]),
		});
		expect(option?.description).toContain("CLI translation proxy");
		expect(option?.description).toContain("direct Command Code API provider");
	});

	it("accepts suggested and custom Command Code models", () => {
		expect(isValidSubscriptionModel("commandcode", "taste-1")).toBe(true);
		expect(
			isValidSubscriptionModel("commandcode", "deepseek/deepseek-v4-flash"),
		).toBe(true);
		expect(
			isValidSubscriptionModel("commandcode", "deepseek/deepseek-v4-pro"),
		).toBe(true);
		expect(isValidSubscriptionModel("commandcode", "gpt-4o")).toBe(true);
	});

	it("maps storage provider id back to subscription option", () => {
		expect(getSubscriptionByStorageProviderId("commandcode")?.id).toBe(
			"commandcode",
		);
		expect(getSubscriptionStorageProviderId("commandcode")).toBe("commandcode");
		expect(getSubscriptionDefaultBaseUrl("commandcode")).toBe(
			"https://api.commandcode.ai/provider/v1",
		);
		expect(
			getUserSubscriptionOption("commandcode")?.supportsConnectionTest,
		).toBe(true);
	});
});

describe("user subscription options", () => {
	it("lists ChatGPT, MiMo, and Command Code in user subscription options", () => {
		expect(userSubscriptionOptions.map((option) => option.id)).toEqual([
			"chatgpt",
			"mimo",
			"commandcode",
		]);
	});
});
