import type { HostKeyErrorResponsePayload } from "#shared/contracts/host-key-error";

export type HostKeyErrorPayload = {
	code: "host_key_missing" | "host_key_mismatch";
	serverId: string;
	serverHost: string;
	observedFingerprint: string;
	observedAlgorithm: string;
	expectedFingerprint?: string;
};

/**
 * Parse a raw API response body into a structured HostKeyErrorPayload.
 * Returns undefined if the response is not a recoverable host-key error.
 */
/** Accepts the shared contract type but also any loosely-typed API response
 *  (e.g. from a union response type where fields are optional). */
type HostKeyErrorBody = Partial<HostKeyErrorResponsePayload> & {
	hostKey?: Partial<HostKeyErrorResponsePayload["hostKey"]>;
};

export function parseHostKeyErrorPayload(
	body: HostKeyErrorBody | null | undefined,
): HostKeyErrorPayload | undefined {
	const hostKeyCode = body?.code;
	if (
		hostKeyCode !== "host_key_missing" &&
		hostKeyCode !== "host_key_mismatch"
	) {
		return undefined;
	}

	return {
		code: hostKeyCode,
		serverId: body?.serverId ?? "",
		serverHost: body?.serverHost ?? "",
		observedFingerprint: body?.hostKey?.observedFingerprint ?? "",
		observedAlgorithm: body?.hostKey?.observedAlgorithm ?? "",
		expectedFingerprint: body?.hostKey?.expectedFingerprint,
	};
}
