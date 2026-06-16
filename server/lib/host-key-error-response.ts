import type { Context } from "hono";
import type {
	HostKeyErrorCode,
	HostKeyErrorResponsePayload,
} from "../../shared/contracts/host-key-error";
import { SshConnectError } from "../ssh";
import type { HostKeyFingerprint } from "../ssh/host-key-fingerprint";

/**
 * Type guard that narrows an unknown error to an SshConnectError with a
 * recoverable host-key code and a non-empty hostKey fingerprint.
 * Errors without a captured hostKey fingerprint fall through so the caller
 * can treat them as generic SSH failures.
 */
export function isRecoverableHostKeyError(
	error: unknown,
): error is SshConnectError & { hostKey: HostKeyFingerprint } {
	return (
		error instanceof SshConnectError &&
		(error.code === "host_key_missing" || error.code === "host_key_mismatch") &&
		Boolean(error.hostKey?.fingerprint)
	);
}

/**
 * Build and return a structured 409 response for host-key recovery.
 * The payload includes the observed fingerprint/algorithm (always) and
 * the expected fingerprint (only for mismatches where a stored pin exists).
 */
export function hostKeyErrorResponse(
	context: Context,
	error: SshConnectError & { hostKey: HostKeyFingerprint },
	serverContext: {
		serverId: string;
		serverHost: string;
		expectedFingerprint: string | null | undefined;
	},
): Response {
	const hostKeyPayload: {
		observedFingerprint: string;
		observedAlgorithm: string;
		expectedFingerprint?: string;
	} = {
		observedFingerprint: error.hostKey.fingerprint,
		observedAlgorithm: error.hostKey.algorithm,
	};

	if (error.code === "host_key_mismatch" && serverContext.expectedFingerprint) {
		hostKeyPayload.expectedFingerprint = serverContext.expectedFingerprint;
	}

	const code = error.code as HostKeyErrorCode;

	return context.json(
		{
			code,
			error:
				code === "host_key_missing"
					? "Host key fingerprint not stored for this server. Trust the host key and retry."
					: "Host key fingerprint mismatch.",
			serverId: serverContext.serverId,
			serverHost: serverContext.serverHost,
			hostKey: hostKeyPayload,
		} satisfies HostKeyErrorResponsePayload,
		409,
	);
}
