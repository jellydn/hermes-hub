import type { NodeSSH } from "node-ssh";

import { deployComposeViaSsh } from "./deploy";
import {
	buildManagedComposeContent,
	type ManagedComposeWebUiMode,
} from "./server-compose";
import { type SshAuthMethod, shellQuote } from "./ssh";
import { assertWebUiReachable } from "./web-ui/reachability";

export type ManagedComposeDeployIntent = "telegram" | "provider" | "web-ui";

/**
 * Managed compose deploy policy matrix. Callers should use `deployManagedCompose`
 * instead of assembling these flags per route.
 *
 * | intent   | webUiMode | compose up                         | pre-up SSH          | post-up SSH                     |
 * |----------|-----------|------------------------------------|---------------------|---------------------------------|
 * | telegram | preserve  | full stack (`docker compose up -d`)| —                   | —                               |
 * | provider | preserve  | full stack                         | —                   | sleep + `hermes config set model`|
 * | web-ui   | preserve  | `--no-deps hermes-webui` only      | `mkdir -p ~/workspace` | `assertWebUiReachable`       |
 */
export type ManagedComposeDeployPolicy = {
	intent: ManagedComposeDeployIntent;
	webUiMode: ManagedComposeWebUiMode;
	composeServices?: string[];
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
			return {
				intent,
				webUiMode: "preserve",
			};
		case "provider": {
			const providerModel = options.providerModel;
			if (!providerModel) {
				throw new Error(
					"providerModel is required for provider deploy intent.",
				);
			}

			return {
				intent,
				webUiMode: "preserve",
				extraSshCommands: async (ssh) => {
					await ssh.execCommand("sleep 2");

					const configResult = await ssh.execCommand(
						`docker exec hermes hermes config set model ${shellQuote(providerModel)}`,
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
				webUiMode: "preserve",
				composeServices: ["hermes-webui"],
				preSshCommands: async (ssh) => {
					const workspaceResult = await ssh.execCommand("mkdir -p ~/workspace");
					if (workspaceResult.code !== 0) {
						throw new Error(
							workspaceResult.stderr || "Failed to create workspace directory",
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
		webUiMode: policy.webUiMode,
	});

	await deployComposeViaSsh({
		host: input.host,
		port: input.port,
		username: input.username,
		authMethod: input.authMethod,
		credential: input.credential,
		composeContent,
		composeServices: policy.composeServices,
		preSshCommands: policy.preSshCommands,
		extraSshCommands: policy.extraSshCommands,
		expectedFingerprint: input.expectedFingerprint,
	});
}
