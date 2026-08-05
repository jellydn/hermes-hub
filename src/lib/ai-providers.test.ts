import { describe, expect, it } from "vitest";
import {
	apiProviderOptions,
	getProviderCredentialPolicy,
	isApiProviderId,
	isValidAiModel,
	isValidModelString,
	MODEL_VALIDATION_REGEX,
	providerRequiresApiKey,
	usesOAuthDeviceCode,
} from "./ai-providers";

describe("MODEL_VALIDATION_REGEX", () => {
	it("matches common production model IDs", () => {
		expect(MODEL_VALIDATION_REGEX.test("gpt-4o")).toBe(true);
		expect(MODEL_VALIDATION_REGEX.test("gpt-4o-mini")).toBe(true);
		expect(MODEL_VALIDATION_REGEX.test("gpt-4-turbo")).toBe(true);
		expect(MODEL_VALIDATION_REGEX.test("claude-sonnet-4-20250514")).toBe(true);
		expect(MODEL_VALIDATION_REGEX.test("claude-haiku-3-5")).toBe(true);
		expect(MODEL_VALIDATION_REGEX.test("openai/gpt-4o-mini")).toBe(true);
		expect(MODEL_VALIDATION_REGEX.test("llama3")).toBe(true);
		expect(MODEL_VALIDATION_REGEX.test("deepseek-chat")).toBe(true);
	});

	it("matches model IDs with colons (version tags)", () => {
		expect(MODEL_VALIDATION_REGEX.test("meta-llama/Llama-3.2:3b")).toBe(true);
		expect(MODEL_VALIDATION_REGEX.test("model:v1.2.3")).toBe(true);
	});

	it("rejects empty strings", () => {
		expect(MODEL_VALIDATION_REGEX.test("")).toBe(false);
	});

	it("rejects strings over 120 characters", () => {
		expect(MODEL_VALIDATION_REGEX.test("a".repeat(121))).toBe(false);
	});

	it("rejects shell metacharacters", () => {
		expect(MODEL_VALIDATION_REGEX.test("$(rm -rf /)")).toBe(false);
		expect(MODEL_VALIDATION_REGEX.test("`whoami`")).toBe(false);
		expect(MODEL_VALIDATION_REGEX.test("; echo pwned")).toBe(false);
		expect(MODEL_VALIDATION_REGEX.test("| cat /etc/passwd")).toBe(false);
		expect(MODEL_VALIDATION_REGEX.test("> /dev/null")).toBe(false);
	});

	it("rejects whitespace", () => {
		expect(MODEL_VALIDATION_REGEX.test("gpt 4o")).toBe(false);
		expect(MODEL_VALIDATION_REGEX.test("\tgpt-4o")).toBe(false);
		expect(MODEL_VALIDATION_REGEX.test("gpt-4o\n")).toBe(false);
	});

	it("rejects special characters not in the allowed set", () => {
		expect(MODEL_VALIDATION_REGEX.test("gpt-4o!")).toBe(false);
		expect(MODEL_VALIDATION_REGEX.test("gpt@4o")).toBe(false);
		expect(MODEL_VALIDATION_REGEX.test("gpt#4o")).toBe(false);
		expect(MODEL_VALIDATION_REGEX.test("gpt~4o")).toBe(false);
	});

	it("accepts models at exactly 120 characters", () => {
		expect(MODEL_VALIDATION_REGEX.test("a".repeat(120))).toBe(true);
	});
});

describe("isValidModelString", () => {
	it("returns true for valid model strings", () => {
		expect(isValidModelString("gpt-4o")).toBe(true);
		expect(isValidModelString("openai/gpt-4o-mini")).toBe(true);
		expect(isValidModelString("deepseek-chat")).toBe(true);
	});

	it("returns false for invalid model strings", () => {
		expect(isValidModelString("")).toBe(false);
		expect(isValidModelString("$(id)")).toBe(false);
		expect(isValidModelString("a".repeat(200))).toBe(false);
	});
});

describe("getProviderCredentialPolicy", () => {
	it("returns api-key policy for OpenAI", () => {
		expect(getProviderCredentialPolicy("openai")).toEqual({
			kind: "api-key",
			requiresApiKey: true,
			requiresBaseUrl: false,
			requiresRemoteOAuth: false,
			reportsStoredKeyWithoutApiKey: false,
		});
	});
});

describe("api provider metadata", () => {
	it("does not include subscription providers in the API grid", () => {
		expect(apiProviderOptions.map((option) => option.id)).not.toContain(
			"openai-codex",
		);
		expect(apiProviderOptions.map((option) => option.id)).not.toContain("mimo");
		expect(usesOAuthDeviceCode("openai")).toBe(false);
		expect(providerRequiresApiKey("openai")).toBe(true);
	});

	it("accepts only whitelisted OpenAI models", () => {
		expect(isValidAiModel("openai", "gpt-4o-mini")).toBe(true);
		expect(isValidAiModel("openai", "gpt-5.5")).toBe(false);
	});

	it("includes deepseek as a first-class API provider", () => {
		expect(apiProviderOptions.map((option) => option.id)).toContain("deepseek");
		expect(isApiProviderId("deepseek")).toBe(true);
	});

	it("accepts whitelisted DeepSeek models", () => {
		expect(isValidAiModel("deepseek", "deepseek-v4-flash")).toBe(true);
		expect(isValidAiModel("deepseek", "deepseek-v4-pro")).toBe(true);
		expect(isValidAiModel("deepseek", "deepseek-chat")).toBe(false);
	});

	it("requires a base URL for DeepSeek", () => {
		expect(getProviderCredentialPolicy("deepseek").requiresBaseUrl).toBe(true);
		expect(providerRequiresApiKey("deepseek")).toBe(false);
	});
});
