import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getAuthSession,
	encryptSecret,
	decryptSecret,
	getOwnedServerRecord,
	resolveServerSshConfigOrError,
	getResolvedServerWebUiRecord,
	proxyRequestOverSsh,
	startDeploy,
} = vi.hoisted(() => ({
	getAuthSession: vi.fn(),
	encryptSecret: vi.fn(),
	decryptSecret: vi.fn(),
	getOwnedServerRecord: vi.fn(),
	resolveServerSshConfigOrError: vi.fn(),
	getResolvedServerWebUiRecord: vi.fn(),
	proxyRequestOverSsh: vi.fn(),
	startDeploy: vi.fn(),
}));

vi.mock("../auth", () => ({
	getAuthSession,
}));

vi.mock("../crypto", () => ({
	encryptSecret,
	decryptSecret,
}));

vi.mock("../server-records", () => ({
	getOwnedServerRecord,
	resolveServerSshConfigOrError,
}));

vi.mock("./records", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./records")>();
	return {
		...actual,
		getResolvedServerWebUiRecord,
		decryptWebUiPassword: (value: string | null) =>
			value ? decryptSecret(value) : null,
	};
});

vi.mock("./proxy", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./proxy")>();
	return {
		...actual,
		proxyRequestOverSsh,
	};
});

vi.mock("./deploy", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./deploy")>();
	return {
		...actual,
		startDeploy,
	};
});

vi.mock("../lib/get-client-ip", () => ({
	getClientIp: () => "127.0.0.1",
}));

vi.mock("../db", () => ({
	getDb: () => ({}),
}));

import {
	deployServerWebUi,
	getServerWebUiStatus,
	proxyServerWebUi,
	revealServerWebUiPassword,
} from "./handlers";

function createContext(input?: {
	method?: string;
	url?: string;
	serverId?: string;
}) {
	return {
		req: {
			raw: new Request(input?.url ?? "http://localhost:3000/", {
				method: input?.method ?? "GET",
			}),
			url: input?.url ?? "http://localhost:3000/",
			header: vi.fn().mockReturnValue(null),
			param: (name: string) =>
				name === "id" ? (input?.serverId ?? "server_123") : undefined,
		},
		json: (body: unknown, status = 200) =>
			Response.json(body, { status }) as Response,
	} as unknown as Context;
}

describe("web-ui handlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		encryptSecret.mockImplementation((value: string) => `enc:${value}`);
		decryptSecret.mockImplementation((value: string) =>
			value.startsWith("enc:") ? value.slice(4) : value,
		);

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

	describe("deploy", () => {
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

			const { DeployError } = await import("./deploy");
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

	describe("status", () => {
		it("returns current Web UI status", async () => {
			getAuthSession.mockResolvedValue({
				user: { id: "user_123" },
				session: { id: "session_123" },
			});
			getResolvedServerWebUiRecord.mockResolvedValue({
				enabled: true,
				encryptedPassword: "enc:password",
				port: 8787,
				deployStatus: "succeeded",
				deployError: null,
				deployStartedAt: null,
				updatedAt: new Date("2026-05-26T04:00:00.000Z"),
			});

			const response = await getServerWebUiStatus(createContext());
			const payload = await response.json();

			expect(response.status).toBe(200);
			expect(payload.webUi?.deployStatus).toBe("succeeded");
			expect(payload.webUi?.enabled).toBe(true);
		});

		it("rejects unauthorized status requests", async () => {
			getAuthSession.mockResolvedValue(null);

			const response = await getServerWebUiStatus(createContext());
			expect(response.status).toBe(401);
		});
	});

	describe("password", () => {
		it("reveals the Web UI password for enabled servers", async () => {
			getAuthSession.mockResolvedValue({
				user: { id: "user_123" },
				session: { id: "session_123" },
			});
			getResolvedServerWebUiRecord.mockResolvedValue({
				enabled: true,
				encryptedPassword: "enc:generated-password",
				port: 8787,
				deployStatus: "succeeded",
				deployError: null,
				deployStartedAt: null,
				updatedAt: new Date("2026-05-26T04:00:00.000Z"),
			});

			const response = await revealServerWebUiPassword(createContext());
			const payload = await response.json();

			expect(response.status).toBe(200);
			expect(payload.password).toBe("generated-password");
		});

		it("rejects unauthorized password reveal requests", async () => {
			getAuthSession.mockResolvedValue(null);

			const response = await revealServerWebUiPassword(createContext());
			expect(response.status).toBe(401);
		});
	});

	describe("proxy", () => {
		it.each([
			["without trailing slash", "/api/servers/server_123/web-ui/proxy"],
			["with trailing slash", "/api/servers/server_123/web-ui/proxy/"],
		])(
			"forwards proxy root %s to upstream /",
			async (_label, proxyRootPath) => {
				getAuthSession.mockResolvedValue({
					user: { id: "user_123" },
					session: { id: "session_123" },
				});
				getResolvedServerWebUiRecord.mockResolvedValue({
					enabled: true,
					encryptedPassword: "enc:generated-password",
					port: 8787,
					deployStatus: "succeeded",
					deployError: null,
					deployStartedAt: null,
					updatedAt: new Date("2026-05-26T04:00:00.000Z"),
				});
				proxyRequestOverSsh.mockResolvedValue(
					new Response("<html>ok</html>", {
						status: 200,
						headers: { "content-type": "text/html" },
					}),
				);

				const response = await proxyServerWebUi(
					createContext({
						url: `http://localhost:3000${proxyRootPath}`,
					}),
				);

				expect(response.status).toBe(200);
				expect(proxyRequestOverSsh).toHaveBeenCalledWith(
					expect.objectContaining({
						upstreamPath: "/",
					}),
				);
			},
		);

		it("returns actionable errors when the upstream port is closed", async () => {
			getAuthSession.mockResolvedValue({
				user: { id: "user_123" },
				session: { id: "session_123" },
			});
			getResolvedServerWebUiRecord.mockResolvedValue({
				enabled: true,
				encryptedPassword: "enc:generated-password",
				port: 8787,
				deployStatus: "succeeded",
				deployError: null,
				deployStartedAt: null,
				updatedAt: new Date("2026-05-26T04:00:00.000Z"),
			});
			proxyRequestOverSsh.mockRejectedValue(
				new Error("(SSH) Channel open failure: Connection refused"),
			);

			const response = await proxyServerWebUi(
				createContext({
					url: "http://localhost:3000/api/servers/server_123/web-ui/proxy/login",
				}),
			);
			const payload = await response.json();

			expect(response.status).toBe(502);
			expect(payload.error).toContain(
				"Hermes Web UI is not reachable on the server (127.0.0.1:8787)",
			);
		});

		it("rewrites upstream root redirects to the proxy path", async () => {
			getAuthSession.mockResolvedValue({
				user: { id: "user_123" },
				session: { id: "session_123" },
			});
			getResolvedServerWebUiRecord.mockResolvedValue({
				enabled: true,
				encryptedPassword: "enc:generated-password",
				port: 8787,
				deployStatus: "succeeded",
				deployError: null,
				deployStartedAt: null,
				updatedAt: new Date("2026-05-26T04:00:00.000Z"),
			});

			proxyRequestOverSsh.mockResolvedValue(
				new Response(null, {
					status: 302,
					headers: {
						Location: "/",
					},
				}),
			);

			const response = await proxyServerWebUi(
				createContext({
					url: "http://localhost:3000/api/servers/server_123/web-ui/proxy/login",
				}),
			);

			expect(response.status).toBe(302);
			expect(response.headers.get("location")).toBe(
				"/api/servers/server_123/web-ui/proxy/",
			);
		});

		it("proxies requests with rewritten response headers", async () => {
			getAuthSession.mockResolvedValue({
				user: { id: "user_123" },
				session: { id: "session_123" },
			});
			getResolvedServerWebUiRecord.mockResolvedValue({
				enabled: true,
				encryptedPassword: "enc:generated-password",
				port: 8787,
				deployStatus: "succeeded",
				deployError: null,
				deployStartedAt: null,
				updatedAt: new Date("2026-05-26T04:00:00.000Z"),
			});

			proxyRequestOverSsh.mockResolvedValue(
				new Response(null, {
					status: 302,
					headers: {
						Location: "/login",
						"Set-Cookie": "session=abc; Path=/",
					},
				}),
			);

			const response = await proxyServerWebUi(
				createContext({
					url: "http://localhost:3000/api/servers/server_123/web-ui/proxy/",
				}),
			);

			expect(response.status).toBe(302);
			expect(response.headers.get("location")).toBe(
				"/api/servers/server_123/web-ui/proxy/login",
			);
			expect(response.headers.get("set-cookie")).toBe(
				"session=abc; Path=/api/servers/server_123/web-ui/proxy/",
			);
		});
	});
});
