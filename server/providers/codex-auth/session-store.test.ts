import { afterEach, describe, expect, it } from "vitest";

import { CODEX_SESSION_TTL_MS } from "./constants";
import {
	getCodexAuthSession,
	resetCodexAuthSessionsForTests,
	storeCodexAuthSession,
} from "./session-store";

describe("codex auth session store", () => {
	afterEach(() => {
		resetCodexAuthSessionsForTests();
	});

	it("removes expired sessions when storing a new one", () => {
		storeCodexAuthSession({
			deviceAuthId: "auth_expired",
			userCode: "OLD-CODE",
			verificationUrl: "https://auth.openai.com/codex/device",
			pollIntervalSeconds: 5,
			expiresAt: "2026-06-06T12:15:00.000Z",
			userId: "user_expired",
			serverId: "server_1",
			createdAt: Date.now() - CODEX_SESSION_TTL_MS - 1,
		});

		storeCodexAuthSession({
			deviceAuthId: "auth_active",
			userCode: "NEW-CODE",
			verificationUrl: "https://auth.openai.com/codex/device",
			pollIntervalSeconds: 5,
			expiresAt: "2026-06-06T12:15:00.000Z",
			userId: "user_active",
			serverId: "server_1",
			createdAt: Date.now(),
		});

		expect(getCodexAuthSession("user_expired")).toBeNull();
		expect(getCodexAuthSession("user_active")).toMatchObject({
			userCode: "NEW-CODE",
		});
	});
});
