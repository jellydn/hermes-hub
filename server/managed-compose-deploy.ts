import type { NodeSSH } from "node-ssh";
import { deployComposeViaSsh } from "./compose-deploy-ssh";
import {
	hermesWebUiContainerGid,
	hermesWebUiContainerUid,
	managedComposeVolumeHome,
} from "./constants";
import { buildManagedComposeContent } from "./server-compose";
import { type SshAuthMethod, shellQuote } from "./ssh";
import { assertWebUiReachable } from "./web-ui/reachability";

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
			if (!providerModel) {
				throw new Error(
					"providerModel is required for provider deploy intent.",
				);
			}

			return {
				intent,
				extraSshCommands: async (ssh) => {
					await ssh.execCommand("sleep 2");

					const configResult = await ssh.execCommand(
						`sudo docker exec hermes hermes config set model ${shellQuote(providerModel)}`,
					);
					if (configResult.code !== 0) {
						throw new Error(
							configResult.stderr || "Failed to set model inside Hermes",
						);
					}
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
				preSshCommands: async (ssh) => {
					const prepResult = await ssh.execCommand(
						[
							`sudo mkdir -p ${managedComposeVolumeHome}/.hermes ${managedComposeVolumeHome}/.hermes/webui ${managedComposeVolumeHome}/workspace`,
							`sudo chown -R ${hermesWebUiContainerUid}:${hermesWebUiContainerGid} ${managedComposeVolumeHome}/.hermes ${managedComposeVolumeHome}/workspace`,
						].join(" && "),
					);
					if (prepResult.code !== 0) {
						throw new Error(
							prepResult.stderr ||
								"Failed to create Hermes Web UI volume directories",
						);
					}
				},
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
	webUiPort?: number;
};

export async function deployManagedCompose(input: ManagedComposeDeployInput) {
	const policy = resolveManagedComposeDeployPolicy(input.intent, {
		webUiPort: input.webUiPort,
		providerModel: input.providerModel,
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
