import { randomUUID } from "node:crypto";
import type { NodeSSH } from "node-ssh";

import { type SshAuthMethod, withSshConnection } from "./ssh";

const COMPOSE_SERVICE_NAME = /^[A-Za-z0-9_.-]+$/;

export function assertValidComposeServiceNames(serviceNames: string[]) {
	for (const serviceName of serviceNames) {
		if (!COMPOSE_SERVICE_NAME.test(serviceName)) {
			throw new Error(`Invalid compose service name: ${serviceName}`);
		}
	}
}

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
};

export function buildComposeUpCommand(input?: {
	composeServices?: string[];
	pull?: boolean;
	forceRecreate?: boolean;
}) {
	const parts = ["cd ~/hermes"];
	const services = input?.composeServices ?? [];
	assertValidComposeServiceNames(services);

	if (input?.pull && services.length > 0) {
		parts.push(`sudo docker compose pull ${services.join(" ")}`);
	}

	const upCommand = ["sudo docker compose up", "-d"];
	if (input?.forceRecreate) {
		upCommand.push("--force-recreate");
	}
	if (services.length > 0) {
		upCommand.push("--no-deps", ...services);
	}
	parts.push(upCommand.join(" "));

	return parts.join(" && ");
}

export async function deployComposeViaSsh(input: DeployComposeInput) {
	const delimiter = `HERMES_COMPOSE_${randomUUID()}`;
	const writeCmd = `cat > ~/hermes/docker-compose.yml << '${delimiter}'\n${input.composeContent}\n${delimiter}`;

	await withSshConnection(
		{
			host: input.host,
			port: input.port,
			username: input.username,
			authMethod: input.authMethod,
			credential: input.credential,
			expectedFingerprint: input.expectedFingerprint,
		},
		async (ssh) => {
			if (input.preSshCommands) {
				await input.preSshCommands(ssh);
			}

			const writeResult = await ssh.execCommand(writeCmd);
			if (writeResult.code !== 0) {
				throw new Error(
					writeResult.stderr || "Failed to write docker-compose.yml",
				);
			}

			const restartResult = await ssh.execCommand(
				buildComposeUpCommand({
					composeServices: input.composeServices,
					pull: input.pullImages,
					forceRecreate: input.forceRecreate,
				}),
			);
			if (restartResult.code !== 0) {
				throw new Error(restartResult.stderr || "Failed to restart Hermes");
			}

			if (input.extraSshCommands) {
				await input.extraSshCommands(ssh);
			}
		},
	);
}
