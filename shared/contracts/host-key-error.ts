export type HostKeyErrorCode = "host_key_missing" | "host_key_mismatch";

export type HostKeyErrorResponsePayload = {
	code: HostKeyErrorCode;
	error: string;
	serverId: string;
	serverHost: string;
	hostKey: {
		observedFingerprint: string;
		observedAlgorithm: string;
		expectedFingerprint?: string;
	};
};
