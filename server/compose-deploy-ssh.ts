import type { NodeSSH } from "node-ssh";

import { composeUp, writeComposeFile } from "./hermes/runtime";
import { type SshAuthMethod, withSshConnection } from "./ssh";

export type DeployComposeInput = {
	host: string;
	port: number;
	username: string;
	authMethod: SshAuthMethod;
	credential: string;
	composeContent: string;
	/** When set, only recreate these services so the Hermes gateway keeps running. */
	composeServices?: string[];
	/** Pull service images before `docker compose up` when targeting specific services. */
	pullImages?: boolean;
	/** Force-recreate targeted containers so stale env vars are replaced on redeploy. */
	forceRecreate?: boolean;
	preSshCommands?: (ssh: NodeSSH) => Promise<void>;
	extraSshCommands?: (ssh: NodeSSH) => Promise<void>;
	expectedFingerprint?: string;
	requireHostKeyPin?: boolean;
};

export async function deployComposeViaSsh(input: DeployComposeInput) {
	await withSshConnection(
		{
			host: input.host,
			port: input.port,
			username: input.username,
			authMethod: input.authMethod,
			credential: input.credential,
			expectedFingerprint: input.expectedFingerprint,
			requireHostKeyPin: input.requireHostKeyPin,
		},
		async (ssh) => {
			if (input.preSshCommands) {
				await input.preSshCommands(ssh);
			}

			await writeComposeFile(ssh, input.composeContent);

			await composeUp(ssh, {
				services: input.composeServices,
				pull: input.pullImages,
				forceRecreate: input.forceRecreate,
			});

			if (input.extraSshCommands) {
				await input.extraSshCommands(ssh);
			}
		},
	);
}
