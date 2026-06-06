import type { NodeSSH } from "node-ssh";

import type { ServerHealthCheckResult } from "../../shared/contracts/server-health-check";
import { hermesContainerName } from "../constants";
import { isContainerRunning } from "../hermes/runtime";
import type { OwnedServerRecord } from "../server-records";
import { type SshAuthMethod, withSshConnection } from "../ssh";
import { HEALTH_CHECK_COMMANDS } from "./commands";
import { buildHealthCheckResult, type HealthCheckCommandOutput } from "./parse";

const STATIC_HEALTH_CHECKS = [
	["uptime", HEALTH_CHECK_COMMANDS.uptime],
	["cpu", HEALTH_CHECK_COMMANDS.cpu],
	["memory", HEALTH_CHECK_COMMANDS.memory],
	["disk", HEALTH_CHECK_COMMANDS.disk],
	["dockerAvailable", HEALTH_CHECK_COMMANDS.dockerAvailable],
	["dockerDaemon", HEALTH_CHECK_COMMANDS.dockerDaemon],
	["dockerCompose", HEALTH_CHECK_COMMANDS.dockerCompose],
	["hermesWorkspace", HEALTH_CHECK_COMMANDS.hermesWorkspace],
	["hermesComposeFile", HEALTH_CHECK_COMMANDS.hermesComposeFile],
] as const satisfies ReadonlyArray<
	readonly [keyof Omit<HealthCheckCommandOutput, "hermesReachability">, string]
>;

export async function runServerHealthChecks(input: {
	server: OwnedServerRecord;
	authMethod: SshAuthMethod;
	credential: string;
}): Promise<ServerHealthCheckResult> {
	return withSshConnection(
		{
			host: input.server.host,
			port: input.server.port,
			username: input.server.username,
			authMethod: input.authMethod,
			credential: input.credential,
			expectedFingerprint: input.server.hostKeyFingerprint ?? undefined,
		},
		async (ssh) => collectHealthCheckOutput(ssh),
	);
}

async function collectHealthCheckOutput(
	ssh: NodeSSH,
): Promise<ServerHealthCheckResult> {
	const output = await runStaticHealthChecks(ssh);
	const hermesRunning = await isContainerRunning(ssh, hermesContainerName);

	if (hermesRunning) {
		output.hermesReachability = readCommandOutput(
			await ssh.execCommand(HEALTH_CHECK_COMMANDS.hermesReachability),
		);
	}

	return buildHealthCheckResult(output, new Date().toISOString(), {
		hermesRunning,
	});
}

async function runStaticHealthChecks(
	ssh: NodeSSH,
): Promise<HealthCheckCommandOutput> {
	const output = {} as Omit<HealthCheckCommandOutput, "hermesReachability">;

	for (const [key, command] of STATIC_HEALTH_CHECKS) {
		// react-doctor-disable-next-line react-doctor/async-await-in-loop
		const result = await ssh.execCommand(command);
		output[key] = readCommandOutput(result);
	}

	return {
		...output,
		hermesReachability: "",
	};
}

function readCommandOutput(result: {
	stdout?: string | null;
	stderr?: string | null;
}) {
	return result.stdout?.trim() || result.stderr?.trim() || "";
}
