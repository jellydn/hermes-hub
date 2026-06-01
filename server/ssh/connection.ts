import { timingSafeEqual } from "node:crypto";
import type { Config as NodeSshConfig } from "node-ssh";
import { NodeSSH } from "node-ssh";
import { normalizeSshError, SshConnectError } from "./errors";
import {
	fingerprintFromKeyHex,
	type HostKeyFingerprint,
} from "./host-key-fingerprint";
import type { VerifiedServerInfo } from "./os";
import { parseAndValidateOs } from "./os";

export type SshAuthMethod = "password" | "ssh-key";

export type SshConnectionInput = {
	host: string;
	port: number;
	username: string;
	authMethod: SshAuthMethod;
	credential: string;
	expectedFingerprint?: string;
};

export type HostKeyInfo = HostKeyFingerprint;

type ExecResult = {
	stdout: string;
	stderr: string;
};

export type VerifiedServerConnection = {
	verified: VerifiedServerInfo;
	hostKey: HostKeyInfo;
};

export async function verifyServerConnection(
	input: SshConnectionInput,
): Promise<VerifiedServerConnection> {
	return withSshConnection(input, async (ssh) => {
		const osRelease = await execStrict(ssh, "cat /etc/os-release");
		const architecture = await execStrict(ssh, "uname -m");

		const verified = parseAndValidateOs(osRelease.stdout, architecture.stdout);
		const hostKey = captureHostKey(ssh);

		return { verified, hostKey };
	});
}

export async function withSshConnection<T>(
	input: SshConnectionInput,
	run: (ssh: NodeSSH) => Promise<T>,
): Promise<T> {
	const ssh = new NodeSSH();
	let observedKey: HostKeyInfo | undefined;

	try {
		const connectOptions: NodeSshConfig = {
			host: input.host,
			port: input.port,
			username: input.username,
			password: input.authMethod === "password" ? input.credential : undefined,
			privateKey: input.authMethod === "ssh-key" ? input.credential : undefined,
			readyTimeout: 15_000,
		};

		if (input.expectedFingerprint) {
			connectOptions.hostHash = "sha256";
			connectOptions.hostVerifier = (keyHex: string) => {
				const observed = fingerprintFromKeyHex(keyHex);
				observedKey = observed;
				if (
					!fingerprintsMatch(
						observed.fingerprint,
						input.expectedFingerprint as string,
					)
				) {
					throw new SshConnectError(
						"host key mismatch",
						"host_key_mismatch",
						observed,
					);
				}
				return true;
			};
		}

		await ssh.connect(connectOptions);
	} catch (error) {
		ssh.dispose();
		const normalized = normalizeSshError(error);
		if (
			normalized instanceof SshConnectError &&
			normalized.code === "host_key_mismatch" &&
			!normalized.hostKey &&
			observedKey
		) {
			throw new SshConnectError(
				normalized.message,
				"host_key_mismatch",
				observedKey,
			);
		}
		throw normalized;
	}

	try {
		return await run(ssh);
	} finally {
		ssh.dispose();
	}
}

function captureHostKey(ssh: NodeSSH): HostKeyInfo {
	const keyHex = ssh.connection?.hostFingerprint;
	if (!keyHex) {
		throw new Error("Host key fingerprint not available");
	}
	return fingerprintFromKeyHex(
		keyHex,
		ssh.connection?.hostKeyAlgorithm ?? "ssh-rsa",
	);
}

function fingerprintsMatch(actual: string, expected: string): boolean {
	const expectedBuf = Buffer.from(expected);
	const actualBuf = Buffer.from(actual);
	if (expectedBuf.length !== actualBuf.length) {
		return false;
	}
	return timingSafeEqual(expectedBuf, actualBuf);
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
