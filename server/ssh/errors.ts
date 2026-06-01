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
