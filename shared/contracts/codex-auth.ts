export const CODEX_SESSION_TTL_MS = 15 * 60 * 1000;
export const CODEX_DEFAULT_POLL_INTERVAL_SECONDS = 5;
export const CODEX_MAX_POLL_ATTEMPTS = Math.ceil(
	CODEX_SESSION_TTL_MS / (CODEX_DEFAULT_POLL_INTERVAL_SECONDS * 1000),
);

export type CodexAuthStatus = {
	authenticated: boolean;
	authMode: string | null;
	lastRefresh: string | null;
	serverHost: string | null;
};

export type CodexAuthStartPayload = {
	userCode: string;
	verificationUrl: string;
	pollIntervalSeconds: number;
	expiresAt: string;
	serverHost: string;
};

export type CodexAuthStartResponse = {
	codexAuth?: CodexAuthStartPayload;
	error?: string;
};

export type CodexAuthStatusResponse = {
	codexAuth?: CodexAuthStatus;
	error?: string;
};

export type CodexAuthCompleteResponse = {
	status?: "authenticated" | "pending";
	serverHost?: string;
	authMode?: string;
	lastRefresh?: string;
	error?: string;
};
