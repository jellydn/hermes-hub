import { stringify } from "yaml";
import { defaultHermesImage } from "./constants";

export function buildHermesComposeContent(input?: {
	apiServerKey?: string;
	telegramBotToken?: string;
	providerEnvVars?: Record<string, string>;
	hermesModel?: string;
}) {
	const env: string[] = ["API_SERVER_ENABLED=true", "API_SERVER_HOST=0.0.0.0"];

	if (input?.apiServerKey) {
		env.push(`API_SERVER_KEY=${input.apiServerKey}`);
	}
	if (input?.telegramBotToken) {
		env.push(`TELEGRAM_BOT_TOKEN=${input.telegramBotToken}`);
	}
	if (input?.hermesModel) {
		env.push(`API_SERVER_MODEL_NAME=${input.hermesModel}`);
	}
	if (input?.providerEnvVars) {
		for (const [key, value] of Object.entries(input.providerEnvVars)) {
			if (value) {
				env.push(`${key}=${value}`);
			}
		}
	}

	return stringify({
		services: {
			hermes: {
				image: defaultHermesImage,
				container_name: "hermes",
				restart: "unless-stopped",
				command: "gateway run",
				ports: ["8642:8642"],
				volumes: ["~/.hermes:/opt/data"],
				environment: env,
			},
		},
	});
}
