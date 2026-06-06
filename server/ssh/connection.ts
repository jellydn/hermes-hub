import { timingSafeEqual } from "node:crypto";
import type { Config as NodeSshConfig } from "node-ssh";
import { NodeSSH } from "node-ssh";
import { normalizeSshError, SshConnectError } from "./errors";
import {
	fingerprintFromKeyBuffer,
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
	return withSshConnection(input, async (ssh, hostKey) => {
		const [osRelease, architecture] = await Promise.all([
			execStrict(ssh, "cat /etc/os-release"),
			execStrict(ssh, "uname -m"),
		]);

		const verified = parseAndValidateOs(osRelease.stdout, architecture.stdout);

		return { verified, hostKey };
	});
}

/**
 * Executes an SSH workflow with automatic lifecycle management of the connection.
 *
 * Rationale on hostVerifier config:
 * Always install a hostVerifier so we can capture the host key (needed for
 * first-time connects to store the fingerprint) and enforce pinning on update/deploy/action paths.
 * Do NOT set `hostHash` here: ssh2 would pre-hash the raw key before calling the verifier,
 * but we need the raw Buffer to derive the OpenSSH SHA256 fingerprint ourselves.
 */
export async function establishSshConnection(
	input: SshConnectionInput,
): Promise<{ ssh: NodeSSH; hostKey: HostKeyInfo }> {
	const ssh = new NodeSSH();
	let capturedHostKey: HostKeyInfo | undefined;

	try {
		const connectOptions: NodeSshConfig = {
			host: input.host,
			port: input.port,
			username: input.username,
			password: input.authMethod === "password" ? input.credential : undefined,
			privateKey: input.authMethod === "ssh-key" ? input.credential : undefined,
			readyTimeout: 15_000,
			hostVerifier: (rawKey: Buffer) => {
				const observed = fingerprintFromKeyBuffer(rawKey);
				capturedHostKey = observed;
				if (
					input.expectedFingerprint &&
					!fingerprintsMatch(observed.fingerprint, input.expectedFingerprint)
				) {
					throw new SshConnectError(
						"host key mismatch",
						"host_key_mismatch",
						observed,
					);
				}
				return true;
			},
		};

		await ssh.connect(connectOptions);
	} catch (error) {
		ssh.dispose();
		const normalized = normalizeSshError(error);
		if (
			normalized instanceof SshConnectError &&
			normalized.code === "host_key_mismatch" &&
			!normalized.hostKey &&
			capturedHostKey
		) {
			throw new SshConnectError(
				normalized.message,
				"host_key_mismatch",
				capturedHostKey,
			);
		}
		throw normalized;
	}

	if (!capturedHostKey) {
		ssh.dispose();
		throw new Error("Host key fingerprint not available");
	}

	return { ssh, hostKey: capturedHostKey };
}

export async function withSshConnection<T>(
	input: SshConnectionInput,
	run: (ssh: NodeSSH, hostKey: HostKeyInfo) => Promise<T>,
): Promise<T> {
	const { ssh, hostKey } = await establishSshConnection(input);

	try {
		return await run(ssh, hostKey);
	} finally {
		ssh.dispose();
	}
}

function fingerprintsMatch(actual: string, expected: string): boolean {
	// expected (from the DB) may have base64 padding, whereas actual is already
	// normalized at the boundary in fingerprintFromKeyBuffer.
	const expectedBuf = Buffer.from(expected.replace(/=+$/, ""));
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
