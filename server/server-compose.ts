import { buildHermesComposeContent } from "./compose";
import { decryptApiServerKey, decryptSecret } from "./crypto";
import { getProviderDeployConfig } from "./providers";
import { getTelegramDeployInfo } from "./providers/records";
import { decryptWebUiPassword, getServerWebUiRecord } from "./web-ui/records";

/** Include web-ui when an explicit password is provided or a stored password exists. */
export type ManagedComposeWebUiMode = "preserve" | "explicit" | "omit";

export const DEFAULT_MANAGED_COMPOSE_WEB_UI_MODE: ManagedComposeWebUiMode =
	"preserve";

export type ManagedComposeSecrets = {
	telegramInfo: Awaited<ReturnType<typeof getTelegramDeployInfo>>;
	providerConfig: Awaited<ReturnType<typeof getProviderDeployConfig>>;
	webUiRecord: Awaited<ReturnType<typeof getServerWebUiRecord>>;
};

export async function resolveManagedComposeSecrets(input: {
	userId: string;
	serverId: string;
	webUiMode?: ManagedComposeWebUiMode;
}): Promise<ManagedComposeSecrets> {
	const webUiMode = input.webUiMode ?? DEFAULT_MANAGED_COMPOSE_WEB_UI_MODE;
	const [telegramInfo, providerConfig, webUiRecord] = await Promise.all([
		getTelegramDeployInfo(input.userId),
		getProviderDeployConfig(input.userId),
		webUiMode === "omit"
			? Promise.resolve(null)
			: getServerWebUiRecord(input.serverId),
	]);

	return { telegramInfo, providerConfig, webUiRecord };
}

export function buildManagedComposeContentFromSecrets(input: {
	serverId: string;
	secrets: ManagedComposeSecrets;
	apiServerKey?: string;
	telegramBotToken?: string;
	webUiPassword?: string;
	webUiMode?: ManagedComposeWebUiMode;
}) {
	const webUiMode = input.webUiMode ?? DEFAULT_MANAGED_COMPOSE_WEB_UI_MODE;
	const { telegramInfo, providerConfig, webUiRecord } = input.secrets;

	let apiServerKey = input.apiServerKey;
	let telegramBotToken = input.telegramBotToken;
	let providerEnvVars: Record<string, string> | undefined;
	let hermesModel: string | undefined;

	if (telegramInfo?.deployedServerId === input.serverId) {
		try {
			apiServerKey =
				input.apiServerKey ?? decryptApiServerKey(telegramInfo.apiServerKey);
			telegramBotToken =
				input.telegramBotToken ?? decryptSecret(telegramInfo.botToken);
		} catch {
			throw new Error("Failed to decrypt Telegram deploy secrets.");
		}
	}

	if (providerConfig) {
		providerEnvVars = providerConfig.envVars;
		hermesModel = providerConfig.model;
	}

	const resolvedWebUiPassword = requireManagedWebUiPasswordForCompose({
		mode: webUiMode,
		webUiPassword: input.webUiPassword,
		webUiRecord,
	});

	return buildHermesComposeContent({
		apiServerKey,
		telegramBotToken,
		providerEnvVars,
		hermesModel,
		webUi: resolvedWebUiPassword
			? {
					password: resolvedWebUiPassword,
					port: webUiRecord?.port,
				}
			: undefined,
	});
}

export async function buildManagedComposeContent(input: {
	userId: string;
	serverId: string;
	apiServerKey?: string;
	telegramBotToken?: string;
	webUiPassword?: string;
	webUiMode?: ManagedComposeWebUiMode;
}) {
	const secrets = await resolveManagedComposeSecrets({
		userId: input.userId,
		serverId: input.serverId,
		webUiMode: input.webUiMode,
	});
	return buildManagedComposeContentFromSecrets({
		serverId: input.serverId,
		apiServerKey: input.apiServerKey,
		telegramBotToken: input.telegramBotToken,
		webUiPassword: input.webUiPassword,
		webUiMode: input.webUiMode,
		secrets,
	});
}

function requireManagedWebUiPasswordForCompose(input: {
	mode: ManagedComposeWebUiMode;
	webUiPassword?: string;
	webUiRecord: Awaited<ReturnType<typeof getServerWebUiRecord>>;
}) {
	if (input.mode === "omit") {
		return null;
	}

	if (input.webUiPassword) {
		return input.webUiPassword;
	}

	if (input.mode === "explicit") {
		return null;
	}

	if (input.webUiRecord?.enabled) {
		const password = decryptWebUiPassword(input.webUiRecord.encryptedPassword);
		if (!password) {
			throw new Error(
				"Stored Hermes Web UI password could not be decrypted. Redeploy the Web UI before rewriting compose.",
			);
		}

		return password;
	}

	return null;
}
