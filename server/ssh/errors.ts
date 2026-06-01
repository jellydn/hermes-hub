export class UnsupportedOsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UnsupportedOsError";
	}
}

export type SshConnectErrorCode =
	| "invalid_credentials"
	| "host_unreachable"
	| "host_key_mismatch"
	| "unsupported_os";

import type { HostKeyFingerprint } from "./host-key-fingerprint";

export class SshConnectError extends Error {
	readonly code: SshConnectErrorCode;
	readonly hostKey?: HostKeyFingerprint;

	constructor(
		message: string,
		code: SshConnectErrorCode = "host_unreachable",
		hostKey?: HostKeyFingerprint,
	) {
		super(message);
		this.name = "SshConnectError";
		this.code = code;
		this.hostKey = hostKey;
	}
}

export function normalizeSshError(error: unknown) {
	if (error instanceof UnsupportedOsError) {
		return error;
	}

	if (error instanceof SshConnectError) {
		return error;
	}

	const message = error instanceof Error ? error.message.toLowerCase() : "";

	if (
		message.includes("all configured authentication methods failed") ||
		message.includes("authentication failed") ||
		message.includes("bad passphrase")
	) {
		return new SshConnectError("invalid credentials", "invalid_credentials");
	}

	if (
		message.includes("timed out") ||
		message.includes("econnrefused") ||
		message.includes("ehostunreach") ||
		message.includes("enotfound") ||
		message.includes("network")
	) {
		return new SshConnectError("host unreachable", "host_unreachable");
	}

	if (
		message.includes("host key fingerprint mismatch") ||
		message.includes("host denied") ||
		message.includes("verification failed") ||
		message.includes("host key verification failed") ||
		message.includes("hostkey verification")
	) {
		return new SshConnectError("host key mismatch", "host_key_mismatch");
	}

	return new SshConnectError("host unreachable", "host_unreachable");
}
