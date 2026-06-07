import { describe, expect, it, vi } from "vitest";

import {
	buildCodexAuthStorePatch,
	buildHermesAuthJsonWriteCommand,
	mergeHermesAuthStore,
	parseCodexAuthStatus,
	parseHermesAuthStoreRaw,
	readHermesAuthJson,
	writeHermesAuthJson,
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

describe("parseHermesAuthStoreRaw", () => {
	it("returns null for empty auth.json", () => {
		expect(parseHermesAuthStoreRaw("")).toBeNull();
	});

	it("rejects non-object JSON payloads", () => {
		expect(() => parseHermesAuthStoreRaw("[]")).toThrow(
			/auth.json is not valid JSON/i,
		);
	});
});

describe("parseCodexAuthStatus", () => {
	it("returns unauthenticated when auth store is missing", () => {
		expect(parseCodexAuthStatus(null)).toEqual({
			authenticated: false,
			authMode: null,
			lastRefresh: null,
			serverHost: null,
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
			serverHost: null,
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

	it("creates parent directory before writing", () => {
		const command = buildHermesAuthJsonWriteCommand("{}");

		expect(command).toContain("mkdir -p");
	});

	it("base64-encodes the content to survive shell quoting", () => {
		const content = '{"active_provider":"openai-codex"}';
		const command = buildHermesAuthJsonWriteCommand(content);
		const expected = Buffer.from(content, "utf8").toString("base64");

		expect(command).toContain(expected);
		expect(command).toContain("base64 -d");
	});

	it("sets chown for hermes user on the auth file", () => {
		const command = buildHermesAuthJsonWriteCommand("{}");

		expect(command).toContain("chown hermes:hermes");
	});
});

describe("parseHermesAuthStoreRaw — additional edge cases", () => {
	it("returns the parsed object for a valid JSON object", () => {
		const result = parseHermesAuthStoreRaw('{"active_provider":"openai-api"}');

		expect(result).toEqual({ active_provider: "openai-api" });
	});

	it("returns null for whitespace-only content", () => {
		expect(parseHermesAuthStoreRaw("   \n  ")).toBeNull();
	});

	it("throws with a custom errorMessage when provided", () => {
		expect(() =>
			parseHermesAuthStoreRaw("[]", "Custom error for tests"),
		).toThrow("Custom error for tests");
	});

	it("rejects JSON number payloads", () => {
		expect(() => parseHermesAuthStoreRaw("42")).toThrow(
			/auth.json is not valid JSON/i,
		);
	});

	it("rejects JSON string payloads", () => {
		expect(() => parseHermesAuthStoreRaw('"hello"')).toThrow(
			/auth.json is not valid JSON/i,
		);
	});

	it("rejects JSON null payload", () => {
		expect(() => parseHermesAuthStoreRaw("null")).toThrow(
			/auth.json is not valid JSON/i,
		);
	});

	it("accepts an object without providers key (partial auth store)", () => {
		const result = parseHermesAuthStoreRaw("{}");
		expect(result).toEqual({});
	});
});

describe("mergeHermesAuthStore — additional edge cases", () => {
	it("does not override active_provider when patch has none", () => {
		const merged = mergeHermesAuthStore(
			{ active_provider: "openai-api", providers: {} },
			{ providers: { "anthropic": { tokens: {} } } },
		);

		expect(merged.active_provider).toBe("openai-api");
	});

	it("merges credential_pool entries from both stores", () => {
		const merged = mergeHermesAuthStore(
			{
				credential_pool: {
					"openai-api": [{ source: "api_key" }],
				},
			},
			{
				credential_pool: {
					"openai-codex": [{ source: "device_code" }],
				},
			},
		);

		expect(merged.credential_pool?.["openai-api"]).toBeTruthy();
		expect(merged.credential_pool?.["openai-codex"]).toBeTruthy();
	});

	it("handles existing store with no providers field", () => {
		const merged = mergeHermesAuthStore(
			{},
			buildCodexAuthStorePatch(
				{ access_token: "a", refresh_token: "r" },
				"2026-06-06T00:00:00.000Z",
			),
		);

		expect(merged.providers?.["openai-codex"]).toBeTruthy();
	});

	it("patch providers overwrite existing same-key providers", () => {
		const merged = mergeHermesAuthStore(
			{ providers: { "openai-codex": { tokens: { access_token: "old" } } } },
			{ providers: { "openai-codex": { tokens: { access_token: "new" } } } },
		);

		const provider = merged.providers?.["openai-codex"] as {
			tokens: { access_token: string };
		};
		expect(provider?.tokens?.access_token).toBe("new");
	});
});

describe("parseCodexAuthStatus — additional edge cases", () => {
	it("returns unauthenticated when openai-codex provider is absent from providers", () => {
		const status = parseCodexAuthStatus({
			providers: {
				"openai-api": { tokens: { access_token: "some-token" } },
			},
		});

		expect(status.authenticated).toBe(false);
	});

	it("returns unauthenticated when providerState has no access_token", () => {
		const status = parseCodexAuthStatus({
			providers: {
				"openai-codex": {
					tokens: { access_token: "" },
					auth_mode: "chatgpt",
				},
			},
		});

		expect(status.authenticated).toBe(false);
	});

	it("returns unauthenticated when providerState has whitespace-only access_token", () => {
		const status = parseCodexAuthStatus({
			providers: {
				"openai-codex": {
					tokens: { access_token: "   " },
					auth_mode: "chatgpt",
				},
			},
		});

		expect(status.authenticated).toBe(false);
	});

	it("defaults authMode to chatgpt when auth_mode is absent", () => {
		const status = parseCodexAuthStatus({
			providers: {
				"openai-codex": {
					tokens: { access_token: "valid-token" },
				},
			},
		});

		expect(status.authenticated).toBe(true);
		expect(status.authMode).toBe("chatgpt");
	});

	it("returns unauthenticated for undefined input", () => {
		expect(parseCodexAuthStatus(undefined)).toEqual({
			authenticated: false,
			authMode: null,
			lastRefresh: null,
			serverHost: null,
		});
	});
});

describe("readHermesAuthJson", () => {
	it("executes sudo cat on the auth.json path", async () => {
		const execCommand = vi.fn().mockResolvedValue({
			code: 0,
			stdout: '{"active_provider":"openai-codex"}',
			stderr: "",
		});
		const ssh = { execCommand } as never;

		const result = await readHermesAuthJson(ssh);

		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("cat"),
		);
		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("auth.json"),
		);
		expect(result).toBe('{"active_provider":"openai-codex"}');
	});

	it("returns empty string when the file does not exist", async () => {
		const execCommand = vi.fn().mockResolvedValue({
			code: 0,
			stdout: "",
			stderr: "",
		});

		const result = await readHermesAuthJson({ execCommand } as never);

		expect(result).toBe("");
	});

	it("returns stdout even when stderr has content (2>/dev/null suppresses permission errors)", async () => {
		const execCommand = vi.fn().mockResolvedValue({
			code: 0,
			stdout: '{"providers":{}}',
			stderr: "sudo: unable to resolve host",
		});

		const result = await readHermesAuthJson({ execCommand } as never);

		expect(result).toBe('{"providers":{}}');
	});
});

describe("writeHermesAuthJson", () => {
	it("runs the write command and succeeds when exit code is 0", async () => {
		const execCommand = vi.fn().mockResolvedValue({
			code: 0,
			stdout: "",
			stderr: "",
		});

		await expect(
			writeHermesAuthJson({ execCommand } as never, '{"providers":{}}'),
		).resolves.toBeUndefined();

		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("auth.json"),
		);
	});

	it("throws when the write command returns a non-zero exit code", async () => {
		const execCommand = vi.fn().mockResolvedValue({
			code: 1,
			stdout: "",
			stderr: "Permission denied",
		});

		await expect(
			writeHermesAuthJson({ execCommand } as never, "{}"),
		).rejects.toThrow("Permission denied");
	});

	it("throws with a fallback message when stderr is empty on failure", async () => {
		const execCommand = vi.fn().mockResolvedValue({
			code: 1,
			stdout: "",
			stderr: "",
		});

		await expect(
			writeHermesAuthJson({ execCommand } as never, "{}"),
		).rejects.toThrow("Failed to write Hermes auth.json");
	});

	it("base64-encodes content so special chars survive the shell", async () => {
		const specialContent = '{"key": "value with \'quotes\' and $pecial chars"}';
		const execCommand = vi.fn().mockResolvedValue({
			code: 0,
			stdout: "",
			stderr: "",
		});

		await writeHermesAuthJson({ execCommand } as never, specialContent);

		const [cmd] = execCommand.mock.calls[0] ?? [];
		const expected = Buffer.from(specialContent, "utf8").toString("base64");
		expect(cmd).toContain(expected);
	});
});
