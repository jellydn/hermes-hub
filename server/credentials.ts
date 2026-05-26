type SessionCredentialRecord = {
	authMethod: "password" | "ssh-key";
	credential: string;
	sessionId: string;
	storedAt: number;
};

const CREDENTIAL_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

const sessionCredentials = new Map<string, SessionCredentialRecord>();

// Periodic cleanup of expired credentials
const cleanupTimer = setInterval(() => {
	const now = Date.now();

	for (const [key, record] of sessionCredentials) {
		if (now - record.storedAt > CREDENTIAL_TTL_MS) {
			sessionCredentials.delete(key);
		}
	}
}, CLEANUP_INTERVAL_MS);

// Allow the timer to keep the process alive if needed, but don't block shutdown
if (cleanupTimer.unref) {
	cleanupTimer.unref();
}

function getCredentialKey(serverId: string, sessionId: string) {
	return `${serverId}:${sessionId}`;
}

export function storeSessionCredential(input: {
	serverId: string;
	sessionId: string;
	authMethod: "password" | "ssh-key";
	credential: string;
}) {
	sessionCredentials.set(getCredentialKey(input.serverId, input.sessionId), {
		authMethod: input.authMethod,
		credential: input.credential,
		sessionId: input.sessionId,
		storedAt: Date.now(),
	});
}

export function getSessionCredential(serverId: string, sessionId: string) {
	const key = getCredentialKey(serverId, sessionId);
	const record = sessionCredentials.get(key) ?? null;

	if (!record) {
		return null;
	}

	// Check TTL on read
	if (Date.now() - record.storedAt > CREDENTIAL_TTL_MS) {
		sessionCredentials.delete(key);
		return null;
	}

	return record;
}
