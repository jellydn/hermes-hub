import type { NodeSSH } from "node-ssh";
import { deployComposeViaSsh } from "./compose-deploy-ssh";
import {
	assertWebUiReachable,
	setProviderInferenceProvider,
	setProviderModel,
	syncAgentSourceForWebUi,
} from "./hermes/runtime";
import { buildManagedComposeContent } from "./server-compose";
import type { SshAuthMethod } from "./ssh";

export type ManagedComposeDeployIntent = "telegram" | "provider" | "web-ui";

/**
 * Managed compose deploy policy matrix. Callers should use `deployManagedCompose`
 * instead of assembling these flags per route.
 *
 * | intent   | compose up                         | pre-up SSH          | post-up SSH                     |
 * |----------|------------------------------------|---------------------|---------------------------------|
 * | telegram | full stack (`docker compose up -d`)| —                   | —                               |
 * | provider | full stack                         | —                   | sleep + `hermes config set model`|
 * | web-ui   | pull + `--no-deps hermes-webui`    | `sudo mkdir -p ...` | `assertWebUiReachable`          |
 */
export type ManagedComposeDeployPolicy = {
	intent: ManagedComposeDeployIntent;
	composeServices?: string[];
	pullImages?: boolean;
	forceRecreate?: boolean;
	preSshCommands?: (ssh: NodeSSH) => Promise<void>;
	extraSshCommands?: (ssh: NodeSSH) => Promise<void>;
};

export type ManagedComposeDeployPolicyOptions = {
	webUiPort?: number;
	providerModel?: string;
	providerHermesId?: string;
};

export function resolveManagedComposeDeployPolicy(
	intent: ManagedComposeDeployIntent,
	options: ManagedComposeDeployPolicyOptions = {},
): ManagedComposeDeployPolicy {
	switch (intent) {
		case "telegram":
			return { intent };
		case "provider": {
			const providerModel = options.providerModel;
			const providerHermesId = options.providerHermesId;
			if (!providerModel) {
				throw new Error(
					"providerModel is required for provider deploy intent.",
				);
			}
			if (!providerHermesId) {
				throw new Error(
					"providerHermesId is required for provider deploy intent.",
				);
			}

			return {
				intent,
				extraSshCommands: async (ssh) => {
					await setProviderInferenceProvider(ssh, providerHermesId);
					await setProviderModel(ssh, providerModel);
				},
			};
		}
		case "web-ui": {
			const webUiPort = options.webUiPort;
			if (webUiPort == null) {
				throw new Error("webUiPort is required for web-ui deploy intent.");
			}

			return {
				intent,
				composeServices: ["hermes-webui"],
				pullImages: true,
				forceRecreate: true,
				preSshCommands: syncAgentSourceForWebUi,
				extraSshCommands: async (ssh) => {
					await assertWebUiReachable(ssh, webUiPort);
				},
			};
		}
	}
}

export type ManagedComposeDeployInput = {
	intent: ManagedComposeDeployIntent;
	userId: string;
	serverId: string;
	host: string;
	port: number;
	username: string;
	authMethod: SshAuthMethod;
	credential: string;
	expectedFingerprint?: string;
	apiServerKey?: string;
	telegramBotToken?: string;
	webUiPassword?: string;
	providerModel?: string;
	providerHermesId?: string;
	webUiPort?: number;
};

export async function deployManagedCompose(input: ManagedComposeDeployInput) {
	const policy = resolveManagedComposeDeployPolicy(input.intent, {
		webUiPort: input.webUiPort,
		providerModel: input.providerModel,
		providerHermesId: input.providerHermesId,
	});

	const composeContent = await buildManagedComposeContent({
		userId: input.userId,
		serverId: input.serverId,
		apiServerKey: input.apiServerKey,
		telegramBotToken: input.telegramBotToken,
		webUiPassword: input.webUiPassword,
		webUiPort: input.webUiPort,
	});

	await deployComposeViaSsh({
		host: input.host,
		port: input.port,
		username: input.username,
		authMethod: input.authMethod,
		credential: input.credential,
		composeContent,
		composeServices: policy.composeServices,
		pullImages: policy.pullImages,
		forceRecreate: policy.forceRecreate,
		preSshCommands: policy.preSshCommands,
		extraSshCommands: policy.extraSshCommands,
		expectedFingerprint: input.expectedFingerprint,
	});
}
