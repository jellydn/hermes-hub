import { buildHermesComposeContent, normalizePublicOrigin } from "./compose";
import { decryptApiServerKey, decryptSecret } from "./crypto";
import { getProviderDeployConfig } from "./providers";
import { getTelegramDeployInfo } from "./providers/records";
import { resolveWebUiPasswordForCompose } from "./web-ui/deploy";
import { getServerWebUiRecord } from "./web-ui/records";

export type ManagedComposeSecrets = {
	telegramInfo: Awaited<ReturnType<typeof getTelegramDeployInfo>>;
	providerConfig: Awaited<ReturnType<typeof getProviderDeployConfig>>;
	webUiRecord: Awaited<ReturnType<typeof getServerWebUiRecord>>;
};

export async function resolveManagedComposeSecrets(input: {
	userId: string;
	serverId: string;
}): Promise<ManagedComposeSecrets> {
	const [telegramInfo, providerConfig, webUiRecord] = await Promise.all([
		getTelegramDeployInfo(input.userId),
		getProviderDeployConfig(input.userId),
		getServerWebUiRecord(input.serverId),
	]);

	return { telegramInfo, providerConfig, webUiRecord };
}

export function buildManagedComposeContentFromSecrets(input: {
	serverId: string;
	secrets: ManagedComposeSecrets;
	apiServerKey?: string;
	telegramBotToken?: string;
	webUiPassword?: string;
	webUiPort?: number;
}) {
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

	const resolvedWebUiPassword = resolveWebUiPasswordForCompose({
		explicitPassword: input.webUiPassword,
		record: webUiRecord,
	});

	return buildHermesComposeContent({
		apiServerKey,
		telegramBotToken,
		providerEnvVars,
		hermesModel,
		webUi: resolvedWebUiPassword
			? {
					password: resolvedWebUiPassword,
					port: input.webUiPort ?? webUiRecord?.port,
					publicOrigin: normalizePublicOrigin(process.env.BETTER_AUTH_URL),
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
	webUiPort?: number;
}) {
	const secrets = await resolveManagedComposeSecrets({
		userId: input.userId,
		serverId: input.serverId,
	});
	return buildManagedComposeContentFromSecrets({
		serverId: input.serverId,
		apiServerKey: input.apiServerKey,
		telegramBotToken: input.telegramBotToken,
		webUiPassword: input.webUiPassword,
		webUiPort: input.webUiPort,
		secrets,
	});
}
