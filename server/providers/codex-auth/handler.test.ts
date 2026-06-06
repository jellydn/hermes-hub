import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	requireAuthSession,
	requireOwnedServerSshById,
	resolveTelegramHermesDeployContext,
	withDeployedHermesServerSsh,
	withSshConnection,
	requestCodexDeviceCode,
	pollCodexDeviceAuthorization,
	exchangeCodexAuthorizationCode,
	readHermesAuthStore,
	writeHermesAuthJson,
} = vi.hoisted(() => ({
	requireAuthSession: vi.fn(),
	requireOwnedServerSshById: vi.fn(),
	resolveTelegramHermesDeployContext: vi.fn(),
	withDeployedHermesServerSsh: vi.fn(),
	withSshConnection: vi.fn(),
	requestCodexDeviceCode: vi.fn(),
	pollCodexDeviceAuthorization: vi.fn(),
	exchangeCodexAuthorizationCode: vi.fn(),
	readHermesAuthStore: vi.fn(),
	writeHermesAuthJson: vi.fn(),
}));

vi.mock("../../request-guards", () => ({
	requireAuthSession,
	requireOwnedServerSshById,
}));

vi.mock("../../hermes/telegram-deploy-context", () => ({
	withDeployedHermesServerSsh,
	resolveTelegramHermesDeployContext,
}));

vi.mock("../../ssh", () => ({
	withSshConnection,
}));

vi.mock("./device-flow", () => ({
	CodexDeviceFlowError: class CodexDeviceFlowError extends Error {
		constructor(
			message: string,
			readonly code: string,
		) {
			super(message);
			this.name = "CodexDeviceFlowError";
		}
	},
	requestCodexDeviceCode,
	pollCodexDeviceAuthorization,
	exchangeCodexAuthorizationCode,
}));

vi.mock("../../hermes/auth-json", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../hermes/auth-json")>();
	return {
		...actual,
		readHermesAuthStore,
		writeHermesAuthJson,
	};
});

import {
	completeCodexAuth,
	getCodexAuthStatus,
	resetCodexAuthSessionsForTests,
	startCodexAuth,
} from "./index";

describe("codex auth handlers", () => {
	const session = {
		session: { id: "session_123" },
		user: { id: "user_123", email: "test@example.com" },
	};

	const deployCtx = {
		telegramInfo: {
			botToken: "token",
			apiServerKey: "key",
			deployedServerId: "server_1",
			deployedServerHost: "1.2.3.4",
		},
		sshCtx: {
			session,
			server: {
				id: "server_1",
				host: "1.2.3.4",
				port: 22,
				username: "root",
				authMethod: "ssh-key",
				hostKeyFingerprint: null,
			},
			serverId: "server_1",
			authMethod: "ssh-key" as const,
			credential: "mock-credential",
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
		resetCodexAuthSessionsForTests();
		requireAuthSession.mockResolvedValue(session);
		resolveTelegramHermesDeployContext.mockResolvedValue(deployCtx);
		requireOwnedServerSshById.mockResolvedValue(deployCtx.sshCtx);
		withDeployedHermesServerSsh.mockImplementation(async (_context, handler) =>
			handler({
				session,
				serverId: deployCtx.sshCtx.serverId,
				serverHost: deployCtx.sshCtx.server.host,
				sshCtx: deployCtx.sshCtx,
			}),
		);
		withSshConnection.mockImplementation(async (_config, handler) =>
			handler({ execCommand: vi.fn() }),
		);
	});

	it("starts device-code auth and returns user-facing code data", async () => {
		requestCodexDeviceCode.mockResolvedValueOnce({
			deviceAuthId: "auth_123",
			userCode: "ABCD-1234",
			verificationUrl: "https://auth.openai.com/codex/device",
			pollIntervalSeconds: 5,
			expiresAt: "2026-06-06T12:15:00.000Z",
		});

		const response = await startCodexAuth(createContext());

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			codexAuth: {
				userCode: "ABCD-1234",
				verificationUrl: "https://auth.openai.com/codex/device",
				pollIntervalSeconds: 5,
				serverHost: "1.2.3.4",
			},
		});
	});

	it("returns pending without resolving deploy context", async () => {
		requestCodexDeviceCode.mockResolvedValueOnce({
			deviceAuthId: "auth_123",
			userCode: "ABCD-1234",
			verificationUrl: "https://auth.openai.com/codex/device",
			pollIntervalSeconds: 5,
			expiresAt: "2026-06-06T12:15:00.000Z",
		});
		await startCodexAuth(createContext());
		resolveTelegramHermesDeployContext.mockClear();

		const { CodexDeviceFlowError } = await import("./device-flow");
		pollCodexDeviceAuthorization.mockRejectedValueOnce(
			new CodexDeviceFlowError(
				"Waiting for ChatGPT authorization.",
				"poll_pending",
			),
		);

		const response = await completeCodexAuth(createContext());

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "pending" });
		expect(resolveTelegramHermesDeployContext).not.toHaveBeenCalled();
		expect(requireOwnedServerSshById).not.toHaveBeenCalled();
	});

	it("writes remote Hermes auth.json after a successful exchange", async () => {
		requestCodexDeviceCode.mockResolvedValueOnce({
			deviceAuthId: "auth_123",
			userCode: "ABCD-1234",
			verificationUrl: "https://auth.openai.com/codex/device",
			pollIntervalSeconds: 5,
			expiresAt: "2026-06-06T12:15:00.000Z",
		});
		await startCodexAuth(createContext());

		pollCodexDeviceAuthorization.mockResolvedValueOnce({
			authorization_code: "auth-code",
			code_verifier: "verifier",
		});
		exchangeCodexAuthorizationCode.mockResolvedValueOnce({
			access_token: "access-token",
			refresh_token: "refresh-token",
		});
		readHermesAuthStore.mockResolvedValueOnce({});
		writeHermesAuthJson.mockResolvedValueOnce(undefined);

		const response = await completeCodexAuth(createContext());

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "authenticated",
			authMode: "chatgpt",
			serverHost: "1.2.3.4",
		});
		expect(requireOwnedServerSshById).toHaveBeenCalledWith(
			expect.anything(),
			"server_1",
			session,
		);
		expect(writeHermesAuthJson).toHaveBeenCalledWith(
			expect.anything(),
			expect.stringContaining('"openai-codex"'),
		);
	});

	it("returns auth status without exposing remote tokens", async () => {
		readHermesAuthStore.mockResolvedValueOnce({
			providers: {
				"openai-codex": {
					tokens: { access_token: "secret-token" },
					auth_mode: "chatgpt",
					last_refresh: "2026-06-06T12:00:00.000Z",
				},
			},
		});

		const response = await getCodexAuthStatus(createContext());

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({
			codexAuth: {
				authenticated: true,
				authMode: "chatgpt",
				lastRefresh: "2026-06-06T12:00:00.000Z",
				serverHost: "1.2.3.4",
			},
		});
		expect(JSON.stringify(body)).not.toContain("secret-token");
	});

	it("returns 502 when remote auth.json is not a plain object", async () => {
		requestCodexDeviceCode.mockResolvedValueOnce({
			deviceAuthId: "auth_123",
			userCode: "ABCD-1234",
			verificationUrl: "https://auth.openai.com/codex/device",
			pollIntervalSeconds: 5,
			expiresAt: "2026-06-06T12:15:00.000Z",
		});
		await startCodexAuth(createContext());

		pollCodexDeviceAuthorization.mockResolvedValueOnce({
			authorization_code: "auth-code",
			code_verifier: "verifier",
		});
		exchangeCodexAuthorizationCode.mockResolvedValueOnce({
			access_token: "access-token",
			refresh_token: "refresh-token",
		});
		readHermesAuthStore.mockRejectedValueOnce(
			new Error(
				"Remote Hermes auth.json is not valid JSON. Fix it on the VPS before continuing.",
			),
		);

		const response = await completeCodexAuth(createContext());

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining("auth.json is not valid JSON"),
		});
		expect(writeHermesAuthJson).not.toHaveBeenCalled();
	});

	it("returns 400 when the stored session server no longer matches", async () => {
		requestCodexDeviceCode.mockResolvedValueOnce({
			deviceAuthId: "auth_123",
			userCode: "ABCD-1234",
			verificationUrl: "https://auth.openai.com/codex/device",
			pollIntervalSeconds: 5,
			expiresAt: "2026-06-06T12:15:00.000Z",
		});
		await startCodexAuth(createContext());

		pollCodexDeviceAuthorization.mockResolvedValueOnce({
			authorization_code: "auth-code",
			code_verifier: "verifier",
		});
		exchangeCodexAuthorizationCode.mockResolvedValueOnce({
			access_token: "access-token",
			refresh_token: "refresh-token",
		});
		requireOwnedServerSshById.mockResolvedValueOnce({
			...deployCtx.sshCtx,
			serverId: "server_2",
			server: { ...deployCtx.sshCtx.server, id: "server_2", host: "5.6.7.8" },
		});

		const response = await completeCodexAuth(createContext());

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining("no longer matches"),
		});
		expect(writeHermesAuthJson).not.toHaveBeenCalled();
	});

	it("returns 400 when complete is called without an active session", async () => {
		const response = await completeCodexAuth(createContext());

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining("No active Codex login session"),
		});
	});
});

function createContext() {
	return {
		req: {
			raw: new Request("http://localhost/api/providers/codex-auth/start", {
				method: "POST",
			}),
		},
		json: (payload: unknown, status = 200) =>
			new Response(JSON.stringify(payload), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as never;
}
