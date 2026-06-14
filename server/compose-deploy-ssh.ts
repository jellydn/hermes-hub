import type { NodeSSH } from "node-ssh";

import { composeUp, writeComposeFile } from "./hermes/runtime";
import { withSshConnection } from "./ssh";
import type { SshConnectionInput } from "./ssh/connection";

export type DeployComposeInput = SshConnectionInput & {
	composeContent: string;
	/** When set, only recreate these services so the Hermes gateway keeps running. */
	composeServices?: string[];
	/** Pull service images before `docker compose up` when targeting specific services. */
	pullImages?: boolean;
	/** Force-recreate targeted containers so stale env vars are replaced on redeploy. */
	forceRecreate?: boolean;
	preSshCommands?: (ssh: NodeSSH) => Promise<void>;
	extraSshCommands?: (ssh: NodeSSH) => Promise<void>;
};

export async function deployComposeViaSsh(input: DeployComposeInput) {
	const {
		composeContent,
		composeServices,
		pullImages,
		forceRecreate,
		preSshCommands,
		extraSshCommands,
		...sshInput
	} = input;
	await withSshConnection(sshInput, async (ssh) => {
		if (preSshCommands) {
			await preSshCommands(ssh);
		}

		await writeComposeFile(ssh, composeContent);

		await composeUp(ssh, {
			services: composeServices,
			pull: pullImages,
			forceRecreate: forceRecreate,
		});

		if (extraSshCommands) {
			await extraSshCommands(ssh);
		}
	});
}
