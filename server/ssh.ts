import { NodeSSH } from "node-ssh";

export type SshAuthMethod = "password" | "ssh-key";

export type SshConnectionInput = {
	host: string;
	port: number;
	username: string;
	authMethod: SshAuthMethod;
	credential: string;
};

export type VerifiedServerInfo = {
	osName: string;
	osVersion: string;
	architecture: string;
	raw: Record<string, string>;
};

type ExecResult = {
	stdout: string;
	stderr: string;
};

export class UnsupportedOsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UnsupportedOsError";
	}
}

export class SshConnectError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SshConnectError";
	}
}

export async function verifyServerConnection(
	input: SshConnectionInput,
): Promise<VerifiedServerInfo> {
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
		const osRelease = await execStrict(ssh, "cat /etc/os-release");
		const architecture = await execStrict(ssh, "uname -m");

		return parseAndValidateOs(osRelease.stdout, architecture.stdout);
	} catch (error) {
		throw normalizeSshError(error);
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

export function parseAndValidateOs(
	osReleaseContent: string,
	architectureOutput: string,
): VerifiedServerInfo {
	const raw = Object.fromEntries(
		osReleaseContent
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.filter((line) => line.includes("="))
			.map((line) => {
				const separatorIndex = line.indexOf("=");
				const key = line.slice(0, separatorIndex);
				const value = line.slice(separatorIndex + 1).replace(/^"|"$/g, "");
				return [key, value];
			}),
	);

	const osId = raw.ID?.toLowerCase();
	const prettyName = raw.PRETTY_NAME ?? raw.NAME ?? "Unknown OS";
	const versionId = raw.VERSION_ID ?? "unknown";
	const architecture = architectureOutput.trim();

	if (osId === "ubuntu") {
		const major = Number.parseInt(versionId.split(".")[0] ?? "0", 10);
		if (major < 22) {
			throw new UnsupportedOsError(
				`Unsupported OS: ${prettyName}. Requires Ubuntu 22.04+ or Debian 12+`,
			);
		}
	} else if (osId === "debian") {
		const major = Number.parseInt(versionId.split(".")[0] ?? "0", 10);
		if (major < 12) {
			throw new UnsupportedOsError(
				`Unsupported OS: ${prettyName}. Requires Ubuntu 22.04+ or Debian 12+`,
			);
		}
	} else {
		throw new UnsupportedOsError(
			`Unsupported OS: ${prettyName}. Requires Ubuntu 22.04+ or Debian 12+`,
		);
	}

	return {
		osName: prettyName,
		osVersion: versionId,
		architecture,
		raw,
	};
}

function normalizeSshError(error: unknown) {
	if (error instanceof UnsupportedOsError) {
		return error;
	}

	const message = error instanceof Error ? error.message.toLowerCase() : "";

	if (
		message.includes("all configured authentication methods failed") ||
		message.includes("authentication failed") ||
		message.includes("bad passphrase")
	) {
		return new SshConnectError("invalid credentials");
	}

	if (
		message.includes("timed out") ||
		message.includes("econnrefused") ||
		message.includes("ehostunreach") ||
		message.includes("enotfound") ||
		message.includes("network")
	) {
		return new SshConnectError("host unreachable");
	}

	return new SshConnectError("host unreachable");
}
