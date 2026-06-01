import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildHermesComposeContent } from "./compose";

describe("buildHermesComposeContent", () => {
	it("renders a minimal compose with no optional inputs", () => {
		const result = buildHermesComposeContent();
		expect(result).toMatchSnapshot();

		const parsed = parse(result);
		expect(parsed.services.hermes).toBeDefined();
		expect(parsed.services.hermes.environment).toEqual(
			expect.arrayContaining([
				"API_SERVER_ENABLED=true",
				"API_SERVER_HOST=0.0.0.0",
			]),
		);
	});

	it("renders a compose with provider env vars only", () => {
		const result = buildHermesComposeContent({
			providerEnvVars: {
				HERMES_INFERENCE_PROVIDER: "openai",
				OPENAI_API_KEY: "sk-test",
			},
		});
		expect(result).toMatchSnapshot();

		const parsed = parse(result);
		expect(parsed.services.hermes.environment).toEqual(
			expect.arrayContaining([
				"HERMES_INFERENCE_PROVIDER=openai",
				"OPENAI_API_KEY=sk-test",
			]),
		);
	});

	it("renders a compose with all options including api key and telegram token", () => {
		const result = buildHermesComposeContent({
			apiServerKey: "test-api-key",
			telegramBotToken: "123456:abc-def",
			providerEnvVars: {
				HERMES_INFERENCE_PROVIDER: "custom",
				BASE_URL: "https://api.example.com",
			},
			hermesModel: "gpt-4o",
		});
		expect(result).toMatchSnapshot();

		const parsed = parse(result);
		expect(parsed.services.hermes.environment).toEqual(
			expect.arrayContaining([
				"API_SERVER_KEY=test-api-key",
				"TELEGRAM_BOT_TOKEN=123456:abc-def",
				"API_SERVER_MODEL_NAME=gpt-4o",
				"HERMES_INFERENCE_PROVIDER=custom",
				"BASE_URL=https://api.example.com",
			]),
		);
	});

	it("escapes double quotes in env values safely", () => {
		const result = buildHermesComposeContent({
			apiServerKey: 'key"with"quotes',
			telegramBotToken: 'tok"en',
			hermesModel: 'model"name',
			providerEnvVars: {
				FOO: 'val"ue',
			},
		});

		const parsed = parse(result);
		const env = parsed.services.hermes.environment as string[];

		// Double quotes inside values should be preserved after YAML parse
		expect(env).toContain('API_SERVER_KEY=key"with"quotes');
		expect(env).toContain('TELEGRAM_BOT_TOKEN=tok"en');
		expect(env).toContain('API_SERVER_MODEL_NAME=model"name');
		expect(env).toContain('FOO=val"ue');
	});

	it("handles values containing colons, hashes, and backticks", () => {
		const result = buildHermesComposeContent({
			providerEnvVars: {
				URL_WITH_COLON: "https://example.com:8080/path",
				HASH_VALUE: "abc#def",
				BACKTICK: "`command`",
			},
		});

		const parsed = parse(result);
		const env = parsed.services.hermes.environment as string[];

		expect(env).toContain("URL_WITH_COLON=https://example.com:8080/path");
		expect(env).toContain("HASH_VALUE=abc#def");
		expect(env).toContain("BACKTICK=`command`");
	});

	it("skips provider env vars with empty values", () => {
		const result = buildHermesComposeContent({
			providerEnvVars: {
				HAS_VALUE: "present",
				EMPTY_VALUE: "",
			},
		});

		const parsed = parse(result);
		const env = parsed.services.hermes.environment as string[];

		expect(env).toContain("HAS_VALUE=present");
		expect(env).not.toContain("EMPTY_VALUE=");
	});

	it("skips api key and telegram token when only one is provided", () => {
		const result = buildHermesComposeContent({
			apiServerKey: "key-only",
		});

		const parsed = parse(result);
		const env = parsed.services.hermes.environment as string[];

		expect(env).not.toContain("API_SERVER_KEY=key-only");
		expect(env).not.toContain("TELEGRAM_BOT_TOKEN=tok");
	});
});
