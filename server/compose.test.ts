import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildHermesComposeContent } from "./compose";
import {
	defaultHermesImage,
	hermesWebUiContainerGid,
	hermesWebUiContainerUid,
	hermesWebUiDefaultWorkspace,
	hermesWebUiImage,
	hermesWebUiStateDir,
	managedComposeVolumeHome,
} from "./constants";

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

	it("round-trips values containing backslashes and dollar signs", () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal $ placeholder, not a template string
		const shellVar = "before${HOME}after";
		const result = buildHermesComposeContent({
			apiServerKey: "C:\\path\\to\\key",
			providerEnvVars: {
				WINDOWS_PATH: "C:\\Users\\runner",
				SHELL_VAR: shellVar,
				BACKSLASH: "single\\back",
			},
		});

		const parsed = parse(result);
		const env = parsed.services.hermes.environment as string[];

		// yaml.stringify must quote values containing backslashes so the
		// literal backslashes survive a parse() round-trip without being
		// collapsed into YAML escape sequences.
		expect(env).toContain("API_SERVER_KEY=C:\\path\\to\\key");
		expect(env).toContain("WINDOWS_PATH=C:\\Users\\runner");
		expect(env).toContain(`SHELL_VAR=before\${HOME}after`);
		expect(env).toContain("BACKSLASH=single\\back");
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

	it("adds the hermes-webui service when web UI is enabled", () => {
		const result = buildHermesComposeContent({
			webUi: {
				password: "generated-password",
			},
		});
		expect(result).toMatchSnapshot();

		const parsed = parse(result);
		expect(parsed.services.hermes.image).toBe(defaultHermesImage);
		expect(parsed.services["hermes-webui"]).toEqual(
			expect.objectContaining({
				image: hermesWebUiImage,
				container_name: "hermes-webui",
				ports: ["127.0.0.1:8787:8787"],
				volumes: [
					`${managedComposeVolumeHome}/.hermes:/home/hermeswebui/.hermes`,
					`${managedComposeVolumeHome}/workspace:/workspace`,
				],
			}),
		);
		expect(parsed.services["hermes-webui"].environment).toEqual(
			expect.arrayContaining([
				"HERMES_WEBUI_HOST=0.0.0.0",
				"HERMES_WEBUI_PORT=8787",
				"HERMES_WEBUI_PASSWORD=generated-password",
				`HERMES_WEBUI_STATE_DIR=${hermesWebUiStateDir}`,
				`HERMES_WEBUI_DEFAULT_WORKSPACE=${hermesWebUiDefaultWorkspace}`,
				`WANTED_UID=${hermesWebUiContainerUid}`,
				`WANTED_GID=${hermesWebUiContainerGid}`,
			]),
		);
	});

	it("sets API_SERVER_KEY independently of TELEGRAM_BOT_TOKEN", () => {
		const result = buildHermesComposeContent({
			apiServerKey: "key-only",
		});

		const parsed = parse(result);
		const env = parsed.services.hermes.environment as string[];

		expect(env).toContain("API_SERVER_KEY=key-only");
		expect(env).not.toContain(expect.stringContaining("TELEGRAM_BOT_TOKEN"));
	});
});
