import { describe, expect, it } from "vitest";

import { apiProviderOptions } from "./ai-providers";
import {
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
	it("exposes ChatGPT models including gpt-5.4-mini", () => {
		const option = getUserSubscriptionOption("chatgpt");

		expect(option).toMatchObject({
			label: "ChatGPT",
			hermesProviderId: "openai-codex",
			authMode: "chatgpt",
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

	it("lists only ChatGPT in user subscription options for now", () => {
		expect(userSubscriptionOptions.map((option) => option.id)).toEqual([
			"chatgpt",
		]);
	});
});
