import { describe, expect, it } from "vitest";

import {
	buildCodexAuthStorePatch,
	buildHermesAuthJsonWriteCommand,
	mergeHermesAuthStore,
	parseCodexAuthStatus,
} from "./auth-json";

describe("buildCodexAuthStorePatch", () => {
	it("writes Hermes-compatible openai-codex auth state without exposing tokens in status helpers", () => {
		const patch = buildCodexAuthStorePatch(
			{
				access_token: "access-token",
				refresh_token: "refresh-token",
			},
			"2026-06-06T12:00:00.000Z",
		);

		expect(patch.active_provider).toBe("openai-codex");
		expect(patch.providers?.["openai-codex"]).toMatchObject({
			auth_mode: "chatgpt",
			last_refresh: "2026-06-06T12:00:00.000Z",
			tokens: {
				access_token: "access-token",
				refresh_token: "refresh-token",
			},
		});
		expect(patch.credential_pool?.["openai-codex"]).toEqual([
			expect.objectContaining({
				source: "device_code",
				auth_type: "oauth",
				base_url: "https://chatgpt.com/backend-api/codex",
			}),
		]);
	});
});

describe("mergeHermesAuthStore", () => {
	it("merges provider entries without dropping unrelated providers", () => {
		const merged = mergeHermesAuthStore(
			{
				active_provider: "openai-api",
				providers: {
					"openai-api": { tokens: { access_token: "legacy" } },
				},
			},
			buildCodexAuthStorePatch(
				{ access_token: "codex-access", refresh_token: "codex-refresh" },
				"2026-06-06T12:00:00.000Z",
			),
		);

		expect(merged.active_provider).toBe("openai-codex");
		expect(merged.providers?.["openai-api"]).toBeTruthy();
		expect(merged.providers?.["openai-codex"]).toBeTruthy();
	});
});

describe("parseCodexAuthStatus", () => {
	it("returns unauthenticated when auth store is missing", () => {
		expect(parseCodexAuthStatus(null)).toEqual({
			authenticated: false,
			authMode: null,
			lastRefresh: null,
		});
	});

	it("returns authenticated metadata without exposing tokens", () => {
		const status = parseCodexAuthStatus({
			providers: {
				"openai-codex": {
					tokens: { access_token: "secret-token" },
					auth_mode: "chatgpt",
					last_refresh: "2026-06-06T12:00:00.000Z",
				},
			},
		});

		expect(status).toEqual({
			authenticated: true,
			authMode: "chatgpt",
			lastRefresh: "2026-06-06T12:00:00.000Z",
		});
		expect(JSON.stringify(status)).not.toContain("secret-token");
	});
});

describe("buildHermesAuthJsonWriteCommand", () => {
	it("writes auth.json with restrictive permissions", () => {
		const command = buildHermesAuthJsonWriteCommand('{"providers":{}}\n');

		expect(command).toContain("chmod 600");
		expect(command).toContain("auth.json");
	});
});
