import { CODEX_SESSION_TTL_MS } from "./constants";
import type { CodexDeviceCodeStart } from "./device-flow";

export type CodexAuthSession = CodexDeviceCodeStart & {
	userId: string;
	serverId: string;
	createdAt: number;
};

const sessionsByUserId = new Map<string, CodexAuthSession>();

export function storeCodexAuthSession(session: CodexAuthSession) {
	for (const [userId, storedSession] of sessionsByUserId.entries()) {
		if (Date.now() - storedSession.createdAt > CODEX_SESSION_TTL_MS) {
			sessionsByUserId.delete(userId);
		}
	}

	sessionsByUserId.set(session.userId, session);
}

export function getCodexAuthSession(userId: string): CodexAuthSession | null {
	const session = sessionsByUserId.get(userId);
	if (!session) {
		return null;
	}

	if (Date.now() - session.createdAt > CODEX_SESSION_TTL_MS) {
		sessionsByUserId.delete(userId);
		return null;
	}

	return session;
}

export function clearCodexAuthSession(userId: string) {
	sessionsByUserId.delete(userId);
}

export function resetCodexAuthSessionsForTests() {
	sessionsByUserId.clear();
}
