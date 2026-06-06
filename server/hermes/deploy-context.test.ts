import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	listHermesDeploymentTargets,
	requireAuthSession,
	requireOwnedServerSshById,
} = vi.hoisted(() => ({
	listHermesDeploymentTargets: vi.fn(),
	requireAuthSession: vi.fn(),
	requireOwnedServerSshById: vi.fn(),
}));

vi.mock("./deploy-targets", () => ({
	listHermesDeploymentTargets,
}));

vi.mock("../request-guards", () => ({
	requireAuthSession,
	requireOwnedServerSshById,
}));

import type { AuthSession } from "../request-guards";
import {
	NO_HERMES_AGENT_ERROR,
	resolveHermesDeployContext,
} from "./deploy-context";

describe("resolveHermesDeployContext", () => {
	const session = {
		session: { id: "session_123" },
		user: { id: "user_123", email: "test@example.com" },
	} as AuthSession;

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

	const targets = [
		{
			serverId: "server_1",
			label: "Primary",
			host: "1.2.3.4",
			installUpdatedAt: "2026-06-06T12:00:00.000Z",
		},
		{
			serverId: "server_2",
			label: "Backup",
			host: "5.6.7.8",
			installUpdatedAt: "2026-06-05T12:00:00.000Z",
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		requireAuthSession.mockResolvedValue(session);
		listHermesDeploymentTargets.mockResolvedValue(targets);
		requireOwnedServerSshById.mockResolvedValue(sshCtx);
	});

	it("returns 401 when unauthenticated", async () => {
		requireAuthSession.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
		);

		const response = await resolveHermesDeployContext(createContext());

		expect(response).toBeInstanceOf(Response);
		expect((response as Response).status).toBe(401);
	});

	it("returns 400 when no successful install exists", async () => {
		listHermesDeploymentTargets.mockResolvedValueOnce([]);

		const response = await resolveHermesDeployContext(createContext());

		expect(response).toBeInstanceOf(Response);
		expect(await (response as Response).json()).toMatchObject({
			error: NO_HERMES_AGENT_ERROR,
		});
	});

	it("defaults to the most recent deployment target", async () => {
		const response = await resolveHermesDeployContext(createContext(), session);

		expect(requireOwnedServerSshById).toHaveBeenCalledWith(
			expect.anything(),
			"server_1",
			session,
		);
		expect(response).toEqual({ sshCtx });
	});

	it("returns 400 when the selected target has no successful install", async () => {
		const response = await resolveHermesDeployContext(
			createContext(),
			session,
			"server_missing",
		);

		expect(response).toBeInstanceOf(Response);
		expect(await (response as Response).json()).toMatchObject({
			error: "Selected server does not have a successful Hermes install.",
		});
		expect(requireOwnedServerSshById).not.toHaveBeenCalled();
	});

	it("resolves SSH context for an explicit owned target", async () => {
		requireOwnedServerSshById.mockResolvedValueOnce({
			...sshCtx,
			serverId: "server_2",
			server: { ...sshCtx.server, id: "server_2", host: "5.6.7.8" },
		});

		const response = await resolveHermesDeployContext(
			createContext(),
			session,
			"server_2",
		);

		expect(requireOwnedServerSshById).toHaveBeenCalledWith(
			expect.anything(),
			"server_2",
			session,
		);
		expect(response).toEqual({
			sshCtx: {
				...sshCtx,
				serverId: "server_2",
				server: { ...sshCtx.server, id: "server_2", host: "5.6.7.8" },
			},
		});
	});

	it("returns credential errors from SSH resolution", async () => {
		requireOwnedServerSshById.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Missing credential" }), {
				status: 400,
			}),
		);

		const response = await resolveHermesDeployContext(createContext(), session);

		expect(response).toBeInstanceOf(Response);
		expect((response as Response).status).toBe(400);
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
