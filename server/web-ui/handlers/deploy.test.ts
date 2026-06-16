import { beforeEach, describe, expect, it, vi } from "vitest";

import { createContext } from "./test-helpers";

const {
	getAuthSession,
	getOwnedServerRecord,
	resolveServerSshConfigOrError,
	startDeploy,
} = vi.hoisted(() => ({
	getAuthSession: vi.fn(),
	getOwnedServerRecord: vi.fn(),
	resolveServerSshConfigOrError: vi.fn(),
	startDeploy: vi.fn(),
}));

vi.mock("../../auth", () => ({
	getAuthSession,
}));

vi.mock("../../crypto", () => ({}));

vi.mock("../../server-records", () => ({
	getOwnedServerRecord,
	resolveServerSshConfigOrError,
}));

vi.mock("../records", () => ({}));

vi.mock("../proxy", () => ({}));

vi.mock(
	"../deploy",
	async (importOriginal: () => Promise<typeof import("../deploy")>) => {
		const actual = await importOriginal();
		return {
			...actual,
			startDeploy,
		};
	},
);

vi.mock("../../lib/get-client-ip", () => ({
	getClientIp: () => "127.0.0.1",
}));

vi.mock("../../db", () => ({
	getDb: () => ({}),
}));

import { deployServerWebUi } from "../handlers";

describe("web-ui deploy", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "ssh-secret",
		});
		getOwnedServerRecord.mockResolvedValue({
			id: "server_123",
			host: "203.0.113.10",
			port: 22,
			username: "root",
			hostKeyFingerprint: null,
		});

		startDeploy.mockResolvedValue({
			status: "deploying",
			webUi: {
				enabled: false,
				port: 8787,
				proxyPath: "/api/servers/server_123/web-ui/proxy/",
				deployStatus: "deploying",
				deployError: null,
				deployStartedAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		});
	});

	it("rejects unauthorized deploy requests", async () => {
		getAuthSession.mockResolvedValue(null);

		const response = await deployServerWebUi(createContext());
		expect(response.status).toBe(401);
	});

	it("returns 202 when deploy starts successfully", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});

		const response = await deployServerWebUi(createContext());
		const payload = await response.json();

		expect(response.status).toBe(202);
		expect(payload.status).toBe("deploying");
	});

	it("maps DeployError to the correct HTTP status", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});

		const { DeployError } = await import("../deploy");
		startDeploy.mockRejectedValue(new DeployError("Install first", 400));

		const response = await deployServerWebUi(createContext());
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toBe("Install first");
	});

	it("re-throws non-DeployError exceptions", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});

		startDeploy.mockRejectedValue(new Error("Boom"));

		await expect(deployServerWebUi(createContext())).rejects.toThrow("Boom");
	});
});
