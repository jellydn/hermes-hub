import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTelegramDeployInfo, requireAuthSession, requireOwnedServerSshById } =
	vi.hoisted(() => ({
		getTelegramDeployInfo: vi.fn(),
		requireAuthSession: vi.fn(),
		requireOwnedServerSshById: vi.fn(),
	}));

vi.mock("../providers/records", () => ({
	getTelegramDeployInfo,
}));

vi.mock("../request-guards", () => ({
	requireAuthSession,
	requireOwnedServerSshById,
}));

import {
	NO_HERMES_DEPLOYMENT_ERROR,
	resolveTelegramHermesDeployContext,
} from "./telegram-deploy-context";

describe("resolveTelegramHermesDeployContext", () => {
	const session = {
		session: { id: "session_123" },
		user: { id: "user_123", email: "test@example.com" },
	};

	const sshCtx = {
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
	};

	beforeEach(() => {
		vi.clearAllMocks();
		requireAuthSession.mockResolvedValue(session);
	});

	it("returns 401 when unauthenticated", async () => {
		requireAuthSession.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
		);

		const response = await resolveTelegramHermesDeployContext(createContext());

		expect(response).toBeInstanceOf(Response);
		expect((response as Response).status).toBe(401);
	});

	it("returns 400 when Telegram deployment is missing", async () => {
		getTelegramDeployInfo.mockResolvedValueOnce(null);

		const response = await resolveTelegramHermesDeployContext(createContext());

		expect(response).toBeInstanceOf(Response);
		expect(await (response as Response).json()).toMatchObject({
			error: NO_HERMES_DEPLOYMENT_ERROR,
		});
	});

	it("returns 400 when deployedServerId is missing", async () => {
		getTelegramDeployInfo.mockResolvedValueOnce({
			botToken: "token",
			apiServerKey: "key",
			deployedServerId: null,
			deployedServerHost: null,
		});

		const response = await resolveTelegramHermesDeployContext(createContext());

		expect(response).toBeInstanceOf(Response);
		expect(await (response as Response).json()).toMatchObject({
			error: NO_HERMES_DEPLOYMENT_ERROR,
		});
	});

	it("returns deploy context when Telegram deployment is ready", async () => {
		getTelegramDeployInfo.mockResolvedValueOnce({
			botToken: "token",
			apiServerKey: "key",
			deployedServerId: "server_1",
			deployedServerHost: "1.2.3.4",
		});
		requireOwnedServerSshById.mockResolvedValueOnce(sshCtx);

		const response = await resolveTelegramHermesDeployContext(
			createContext(),
			session as never,
		);

		expect(response).toEqual({
			telegramInfo: {
				botToken: "token",
				apiServerKey: "key",
				deployedServerId: "server_1",
				deployedServerHost: "1.2.3.4",
			},
			sshCtx,
		});
	});
});

function createContext() {
	return {
		json: (payload: unknown, status = 200) =>
			new Response(JSON.stringify(payload), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as never;
}
