import type { NodeSSH } from "node-ssh";

import type { ServerHealthCheckResult } from "../../shared/contracts/server-health-check";
import type { OwnedServerRecord } from "../server-records";
import { type SshAuthMethod, withSshConnection } from "../ssh";
import { HEALTH_CHECK_COMMANDS } from "./commands";
import { buildHealthCheckResult, type HealthCheckCommandOutput } from "./parse";

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
	const [
		uptimeResult,
		cpuResult,
		memoryResult,
		diskResult,
		dockerAvailableResult,
		dockerDaemonResult,
		hermesContainerResult,
		sshPasswordAuthResult,
		sshRootLoginResult,
		firewallResult,
		securityUpdatesResult,
	] = await Promise.all([
		ssh.execCommand(HEALTH_CHECK_COMMANDS.uptime),
		ssh.execCommand(HEALTH_CHECK_COMMANDS.cpu),
		ssh.execCommand(HEALTH_CHECK_COMMANDS.memory),
		ssh.execCommand(HEALTH_CHECK_COMMANDS.disk),
		ssh.execCommand(HEALTH_CHECK_COMMANDS.dockerAvailable),
		ssh.execCommand(HEALTH_CHECK_COMMANDS.dockerDaemon),
		ssh.execCommand(HEALTH_CHECK_COMMANDS.hermesContainer),
		ssh.execCommand(HEALTH_CHECK_COMMANDS.sshPasswordAuth),
		ssh.execCommand(HEALTH_CHECK_COMMANDS.sshRootLogin),
		ssh.execCommand(HEALTH_CHECK_COMMANDS.firewall),
		ssh.execCommand(HEALTH_CHECK_COMMANDS.securityUpdates),
	]);

	const hermesRunning = hermesContainerResult.stdout.trim().includes("hermes");
	const hermesReachabilityResult = hermesRunning
		? await ssh.execCommand(HEALTH_CHECK_COMMANDS.hermesReachability)
		: { stdout: "", stderr: "", code: 0 };

	const output: HealthCheckCommandOutput = {
		uptime: readCommandOutput(uptimeResult),
		cpu: readCommandOutput(cpuResult),
		memory: readCommandOutput(memoryResult),
		disk: readCommandOutput(diskResult),
		dockerAvailable: readCommandOutput(dockerAvailableResult),
		dockerDaemon: readCommandOutput(dockerDaemonResult),
		hermesContainer: readCommandOutput(hermesContainerResult),
		hermesReachability: readCommandOutput(hermesReachabilityResult),
		sshPasswordAuth: readCommandOutput(sshPasswordAuthResult),
		sshRootLogin: readCommandOutput(sshRootLoginResult),
		firewall: readCommandOutput(firewallResult),
		securityUpdates: readCommandOutput(securityUpdatesResult),
	};

	return buildHealthCheckResult(output, new Date().toISOString());
}

function readCommandOutput(result: {
	stdout?: string | null;
	stderr?: string | null;
}) {
	return result.stdout?.trim() || result.stderr?.trim() || "";
}
