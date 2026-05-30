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
	supportLevel: "supported" | "untested";
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

	// Non-Linux or missing os-release: throw
	if (!osId || osId === "unknown") {
		throw new UnsupportedOsError(
			`Unsupported OS: ${prettyName}. This server does not appear to run a Linux distribution with /etc/os-release.`,
		);
	}

	// Ubuntu 22.04+ and Debian 12+ are officially supported
	if (
		(osId === "ubuntu" &&
			Number.parseInt(versionId.split(".")[0] ?? "0", 10) >= 22) ||
		(osId === "debian" &&
			Number.parseInt(versionId.split(".")[0] ?? "0", 10) >= 12)
	) {
		return {
			osName: prettyName,
			osVersion: versionId,
			architecture,
			raw,
			supportLevel: "supported",
		};
	}

	// Ubuntu < 22, Debian < 12, or any other Linux distro → warn-and-proceed
	return {
		osName: prettyName,
		osVersion: versionId,
		architecture,
		raw,
		supportLevel: "untested",
	};
}

export function normalizeSshError(error: unknown) {
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
