import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { buildManagedComposeContentFromSecrets } from "./server-compose";

describe("buildManagedComposeContentFromSecrets", () => {
	it("includes an explicit Telegram bot token before deploy state is persisted", () => {
		const compose = buildManagedComposeContentFromSecrets({
			serverId: "server_1",
			apiServerKey: "fresh-api-key",
			telegramBotToken: "123456:abc-def",
			secrets: {
				telegramInfo: null,
				providerConfig: null,
				webUiRecord: null,
			},
		});

		const parsed = parse(compose);
		expect(parsed.services.hermes.environment).toEqual(
			expect.arrayContaining([
				"API_SERVER_KEY=fresh-api-key",
				"TELEGRAM_BOT_TOKEN=123456:abc-def",
			]),
		);
	});

	it("throws when an enabled Web UI password cannot be decrypted", () => {
		expect(() =>
			buildManagedComposeContentFromSecrets({
				serverId: "server_1",
				secrets: {
					telegramInfo: null,
					providerConfig: null,
					webUiRecord: {
						enabled: true,
						encryptedPassword: "bad-ciphertext",
						port: 8787,
						deployStatus: "succeeded",
						deployError: null,
						updatedAt: new Date(),
					},
				},
			}),
		).toThrow(/could not be decrypted/i);
	});

	it("prefers an explicit webUiPort over the stored record port", () => {
		const compose = buildManagedComposeContentFromSecrets({
			serverId: "server_1",
			webUiPassword: "generated-password",
			webUiPort: 9001,
			secrets: {
				telegramInfo: null,
				providerConfig: null,
				webUiRecord: {
					enabled: true,
					encryptedPassword: "enc:password",
					port: 8787,
					deployStatus: "succeeded",
					deployError: null,
					updatedAt: new Date(),
				},
			},
		});

		const parsed = parse(compose);
		expect(parsed.services["hermes-webui"].ports).toEqual([
			"127.0.0.1:9001:9001",
		]);
	});
});
