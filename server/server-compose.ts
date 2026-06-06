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
	webUiPassword?: string;
	webUiMode?: ManagedComposeWebUiMode;
}) {
	const webUiMode = input.webUiMode ?? DEFAULT_MANAGED_COMPOSE_WEB_UI_MODE;
	const { telegramInfo, providerConfig, webUiRecord } = input.secrets;

	let apiServerKey = input.apiServerKey;
	let telegramBotToken: string | undefined;
	let providerEnvVars: Record<string, string> | undefined;
	let hermesModel: string | undefined;

	if (telegramInfo?.deployedServerId === input.serverId) {
		try {
			apiServerKey =
				input.apiServerKey ?? decryptApiServerKey(telegramInfo.apiServerKey);
			telegramBotToken = decryptSecret(telegramInfo.botToken);
		} catch {
			throw new Error("Failed to decrypt Telegram deploy secrets.");
		}
	}

	if (providerConfig) {
		providerEnvVars = providerConfig.envVars;
		hermesModel = providerConfig.model;
	}

	const resolvedWebUiPassword = resolveManagedWebUiPassword({
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
		webUiPassword: input.webUiPassword,
		webUiMode: input.webUiMode,
		secrets,
	});
}

function resolveManagedWebUiPassword(input: {
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
		return decryptWebUiPassword(input.webUiRecord.encryptedPassword);
	}

	return null;
}
