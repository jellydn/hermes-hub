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
});
