import { stringify } from "yaml";
import {
	defaultHermesImage,
	defaultHermesWebUiPort,
	hermesWebUiContainerGid,
	hermesWebUiContainerUid,
	hermesWebUiDefaultWorkspace,
	hermesWebUiImage,
	hermesWebUiStateDir,
	hermesWebUiTrustForwardedHost,
	hermesWebUiTrustForwardedProto,
	managedComposeVolumeHome,
} from "./constants";

export type HermesWebUiComposeInput = {
	password: string;
	port?: number;
};

export function buildHermesComposeContent(input?: {
	apiServerKey?: string;
	telegramBotToken?: string;
	providerEnvVars?: Record<string, string>;
	hermesModel?: string;
	webUi?: HermesWebUiComposeInput;
	/** Host path prefix for bind mounts. Defaults to sudo docker's home (/root). */
	volumeHome?: string;
}) {
	const volumeHome = input?.volumeHome ?? managedComposeVolumeHome;
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

	const services: Record<string, unknown> = {
		hermes: {
			image: defaultHermesImage,
			container_name: "hermes",
			restart: "unless-stopped",
			command: "gateway run",
			ports: ["8642:8642"],
			volumes: [`${volumeHome}/.hermes:/opt/data`],
			environment: env,
		},
	};

	if (input?.webUi) {
		const port = input.webUi.port ?? defaultHermesWebUiPort;
		services["hermes-webui"] = {
			image: hermesWebUiImage,
			container_name: "hermes-webui",
			restart: "unless-stopped",
			ports: [`127.0.0.1:${port}:${port}`],
			volumes: [
				`${volumeHome}/.hermes:/home/hermeswebui/.hermes`,
				`${volumeHome}/workspace:/workspace`,
			],
			environment: [
				"HERMES_WEBUI_HOST=0.0.0.0",
				`HERMES_WEBUI_PORT=${port}`,
				`HERMES_WEBUI_PASSWORD=${input.webUi.password}`,
				`HERMES_WEBUI_STATE_DIR=${hermesWebUiStateDir}`,
				`HERMES_WEBUI_DEFAULT_WORKSPACE=${hermesWebUiDefaultWorkspace}`,
				`WANTED_UID=${hermesWebUiContainerUid}`,
				`WANTED_GID=${hermesWebUiContainerGid}`,
				`HERMES_WEBUI_TRUST_FORWARDED_HOST=${hermesWebUiTrustForwardedHost}`,
				`HERMES_WEBUI_TRUST_FORWARDED_PROTO=${hermesWebUiTrustForwardedProto}`,
			],
		};
	}

	return stringify({ services });
}
