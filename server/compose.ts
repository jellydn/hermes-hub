import { defaultHermesImage } from "./constants";

export function buildHermesComposeContent(input?: {
	apiServerKey?: string;
	telegramBotToken?: string;
	providerEnvVars?: Record<string, string>;
	hermesModel?: string;
}) {
	const lines = [
		"services:",
		"  hermes:",
		`    image: ${defaultHermesImage}`,
		"    container_name: hermes",
		"    restart: unless-stopped",
		"    command: gateway run",
		"    ports:",
		'      - "8642:8642"',
		"    volumes:",
		"      - ~/.hermes:/opt/data",
		"    environment:",
		"      - API_SERVER_ENABLED=true",
		"      - API_SERVER_HOST=0.0.0.0",
	];

	if (input?.apiServerKey && input?.telegramBotToken) {
		lines.push(`      - API_SERVER_KEY=${input.apiServerKey}`);
		lines.push(`      - TELEGRAM_BOT_TOKEN=${input.telegramBotToken}`);
	} else {
		lines.push(
			"      # API_SERVER_KEY and TELEGRAM_BOT_TOKEN are set by telegram deploy",
		);
	}

	if (input?.hermesModel) {
		lines.push(`      - HERMES_DEFAULT_MODEL=${input.hermesModel}`);
	}

	if (input?.providerEnvVars) {
		for (const [key, value] of Object.entries(input.providerEnvVars)) {
			if (value) {
				lines.push(`      - ${key}=${value}`);
			}
		}
	}

	return lines.join("\n");
}
