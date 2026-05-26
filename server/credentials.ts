type EphemeralCredentialRecord = {
	authMethod: "password" | "ssh-key";
	credential: string;
	sessionId: string;
	storedAt: number;
};

const ephemeralCredentials = new Map<string, EphemeralCredentialRecord>();

function getCredentialKey(serverId: string, sessionId: string) {
	return `${serverId}:${sessionId}`;
}

export function storeEphemeralCredential(input: {
	serverId: string;
	sessionId: string;
	authMethod: "password" | "ssh-key";
	credential: string;
}) {
	ephemeralCredentials.set(getCredentialKey(input.serverId, input.sessionId), {
		authMethod: input.authMethod,
		credential: input.credential,
		sessionId: input.sessionId,
		storedAt: Date.now(),
	});
}

export function getEphemeralCredential(serverId: string, sessionId: string) {
	return (
		ephemeralCredentials.get(getCredentialKey(serverId, sessionId)) ?? null
	);
}
