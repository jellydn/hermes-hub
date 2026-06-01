import { NodeSSH } from "node-ssh";
import { normalizeSshError } from "./errors";
import type { VerifiedServerInfo } from "./os";
import { parseAndValidateOs } from "./os";

export type SshAuthMethod = "password" | "ssh-key";

export type SshConnectionInput = {
	host: string;
	port: number;
	username: string;
	authMethod: SshAuthMethod;
	credential: string;
};

type ExecResult = {
	stdout: string;
	stderr: string;
};

export async function verifyServerConnection(
	input: SshConnectionInput,
): Promise<VerifiedServerInfo> {
	return withSshConnection(input, async (ssh) => {
		const osRelease = await execStrict(ssh, "cat /etc/os-release");
		const architecture = await execStrict(ssh, "uname -m");

		return parseAndValidateOs(osRelease.stdout, architecture.stdout);
	});
}

export async function withSshConnection<T>(
	input: SshConnectionInput,
	run: (ssh: NodeSSH) => Promise<T>,
) {
	const ssh = new NodeSSH();

	try {
		await ssh.connect({
			host: input.host,
			port: input.port,
			username: input.username,
			password: input.authMethod === "password" ? input.credential : undefined,
			privateKey: input.authMethod === "ssh-key" ? input.credential : undefined,
			readyTimeout: 15_000,
		});
	} catch (error) {
		ssh.dispose();
		throw normalizeSshError(error);
	}

	try {
		return await run(ssh);
	} finally {
		ssh.dispose();
	}
}

async function execStrict(ssh: NodeSSH, command: string): Promise<ExecResult> {
	const result = await ssh.execCommand(command);

	if (result.code !== 0) {
		throw new Error(result.stderr || `Command failed: ${command}`);
	}

	return {
		stdout: result.stdout,
		stderr: result.stderr,
	};
}
