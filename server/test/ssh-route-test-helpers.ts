import { vi } from "vitest";

export const sshRouteTestMocks = {
	getAuthSession: vi.fn(),
	getSessionCredential: vi.fn(),
	decryptSecret: vi.fn(),
	withSshConnection: vi.fn(),
	dbInsert: vi.fn(),
	dbSelect: vi.fn(),
	insertAuditValues: vi.fn(),
	selectFrom: vi.fn(),
	selectWhere: vi.fn(),
	selectLimit: vi.fn(),
};

export const defaultOwnedServerRecord = {
	id: "server_123",
	label: "Prod VPS",
	host: "203.0.113.10",
	port: 22,
	username: "root",
	authMethod: "password",
	encryptedCredential: "encrypted-secret",
	storeCredential: true,
	status: "connected",
	osInfo: {
		name: "Ubuntu",
		version: "24.04",
		architecture: "x86_64",
	},
	hostKeyFingerprint: "SHA256:abc",
};

export function setupOwnedServerRouteMocks() {
	vi.clearAllMocks();

	sshRouteTestMocks.getAuthSession.mockResolvedValue({
		session: { id: "session_123" },
		user: { id: "user_123", email: "test@example.com" },
	});

	sshRouteTestMocks.dbInsert.mockReturnValue({
		values: sshRouteTestMocks.insertAuditValues,
	});
	sshRouteTestMocks.insertAuditValues.mockResolvedValue(undefined);

	sshRouteTestMocks.dbSelect.mockReturnValue({
		from: sshRouteTestMocks.selectFrom,
	});
	sshRouteTestMocks.selectFrom.mockReturnValue({
		where: sshRouteTestMocks.selectWhere,
	});
	sshRouteTestMocks.selectWhere.mockReturnValue({
		limit: sshRouteTestMocks.selectLimit,
	});

	sshRouteTestMocks.selectLimit.mockReset();
	sshRouteTestMocks.selectLimit.mockResolvedValue([defaultOwnedServerRecord]);

	sshRouteTestMocks.decryptSecret.mockReturnValue("secret");
}

export function createOwnedServerRouteContext(options?: {
	serverId?: string;
	path?: string;
	method?: string;
	body?: Record<string, unknown>;
}) {
	const serverId = options?.serverId ?? "server_123";
	const path =
		options?.path ?? `/api/servers/${serverId || "missing"}/health-check`;
	const method = options?.method ?? "POST";

	return {
		req: {
			raw: new Request(`http://localhost${path}`, {
				method,
				...(options?.body
					? {
							body: JSON.stringify(options.body),
							headers: { "content-type": "application/json" },
						}
					: {}),
			}),
			header: () => null,
			param: (name: string) =>
				name === "id" ? serverId || undefined : undefined,
			json: async () => options?.body ?? {},
		},
		json: (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as never;
}

export function mockHealthyHealthCheckExec() {
	sshRouteTestMocks.withSshConnection.mockImplementation(
		async (_input, run) => {
			const execCommand = vi.fn(async (command: string) => {
				if (command.includes("uptime")) {
					return { code: 0, stdout: "up 2 days", stderr: "" };
				}
				if (command.includes("top -bn1")) {
					return { code: 0, stdout: "24", stderr: "" };
				}
				if (command.includes("free |")) {
					return { code: 0, stdout: "42", stderr: "" };
				}
				if (command.includes("df -P /")) {
					return { code: 0, stdout: "55", stderr: "" };
				}
				if (command.includes("command -v docker")) {
					return { code: 0, stdout: "yes", stderr: "" };
				}
				if (command.includes("docker info")) {
					return { code: 0, stdout: "yes", stderr: "" };
				}
				if (command.includes("docker ps --filter")) {
					return { code: 0, stdout: "hermes", stderr: "" };
				}
				if (command.includes("passwordauthentication")) {
					return { code: 0, stdout: "no", stderr: "" };
				}
				if (command.includes("permitrootlogin")) {
					return { code: 0, stdout: "no", stderr: "" };
				}
				if (
					command.includes("ufw status") ||
					command.includes("firewall-cmd")
				) {
					return { code: 0, stdout: "Status: active", stderr: "" };
				}
				if (command.includes("apt-get") || command.includes("dnf updateinfo")) {
					return { code: 0, stdout: "0", stderr: "" };
				}
				if (command.includes("curl -s -o /dev/null")) {
					return { code: 0, stdout: "200", stderr: "" };
				}

				return { code: 0, stdout: "", stderr: "" };
			});

			return run({ execCommand });
		},
	);
}
