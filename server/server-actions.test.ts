import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthSession = vi.fn();
const getSessionCredential = vi.fn();
const decryptSecret = vi.fn();
const withSshConnection = vi.fn();
const dbInsert = vi.fn();
const dbSelect = vi.fn();
const dbUpdate = vi.fn();
const transaction = vi.fn();
const insertAuditValues = vi.fn();
const updateInstallSet = vi.fn();
const updateInstallWhere = vi.fn();
const selectFrom = vi.fn();
const selectWhere = vi.fn();
const selectOrderBy = vi.fn();
const selectLimit = vi.fn();

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./credentials", () => ({
	getSessionCredential,
}));

vi.mock("./crypto", () => ({
	decryptSecret,
}));

vi.mock("./ssh", () => {
	class SshConnectError extends Error {
		constructor(message: string) {
			super(message);
			this.name = "SshConnectError";
		}
	}

	return {
		SshConnectError,
		withSshConnection,
	};
});

vi.mock("./db", () => ({
	getDb: () => ({
		insert: dbInsert,
		select: dbSelect,
		update: dbUpdate,
		transaction,
	}),
}));

vi.mock("./web-ui/records", () => ({
	getServerWebUiRecord: vi.fn().mockResolvedValue(null),
	getWebUiProxyPath: (serverId: string) =>
		`/api/servers/${serverId}/web-ui/proxy/`,
}));

function mockSshExec(
	implementation?: (
		command: string,
	) => Promise<{ code: number; stdout: string; stderr: string }>,
) {
	withSshConnection.mockImplementation(async (_input, run) => {
		const execCommand = vi.fn(async (command: string) => {
			if (implementation) {
				return implementation(command);
			}

			return { code: 0, stdout: "ok", stderr: "" };
		});
		return run({ execCommand });
	});
}

describe("server actions", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		getAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});

		transaction.mockImplementation(async (fn) => {
			const tx = {
				insert: dbInsert,
				select: dbSelect,
				update: dbUpdate,
			};
			return fn(tx);
		});
		dbInsert.mockReturnValue({ values: insertAuditValues });
		insertAuditValues.mockResolvedValue(undefined);

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({ orderBy: selectOrderBy, limit: selectLimit });
		selectOrderBy.mockReturnValue({ limit: selectLimit });

		// reset to clear stale _onceImpl chains from prior tests
		selectLimit.mockReset();
		selectLimit
			.mockResolvedValueOnce([
				{
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
				},
			])
			.mockResolvedValueOnce([{ version: "latest" }])
			.mockResolvedValueOnce([{ id: "install_123" }]);

		decryptSecret.mockReturnValue("secret");
		updateInstallWhere.mockResolvedValue(undefined);
		updateInstallSet.mockReturnValue({ where: updateInstallWhere });
		dbUpdate.mockReturnValue({ set: updateInstallSet });

		mockSshExec();
	});

	it("runs restart actions over SSH and records audit history", async () => {
		const execCommand = vi.fn().mockResolvedValue({
			code: 0,
			stdout: "ok",
			stderr: "",
		});
		withSshConnection.mockImplementation(async (_input, run) =>
			run({ execCommand }),
		);

		const { runServerAction } = await import("./server-actions");
		const response = await runServerAction(
			createContext({ action: "restart" }),
		);

		expect(execCommand).toHaveBeenCalledWith(
			"cd ~/hermes && sudo docker compose restart hermes",
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "succeeded",
			action: "restart",
		});
		expect(decryptSecret).toHaveBeenCalledWith("encrypted-secret");
		expect(withSshConnection).toHaveBeenCalled();
		expect(insertAuditValues).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				action: "server.action.restart.started",
			}),
		);
		expect(insertAuditValues).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				action: "server.action.restart.succeeded",
			}),
		);
	});

	it("returns a reconnect error when temporary credentials are gone", async () => {
		selectLimit.mockReset();
		selectLimit.mockResolvedValueOnce([
			{
				id: "server_123",
				label: "Prod VPS",
				host: "203.0.113.10",
				port: 22,
				username: "root",
				authMethod: "ssh-key",
				encryptedCredential: null,
				storeCredential: false,
				status: "connected",
				osInfo: {},
			},
		]);
		getSessionCredential.mockReturnValue(null);

		const { runServerAction } = await import("./server-actions");
		const response = await runServerAction(createContext({ action: "update" }));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Temporary credential expired. Reconnect the server first.",
		});
		expect(withSshConnection).not.toHaveBeenCalled();
	});

	it("builds a server detail snapshot with the latest action history", async () => {
		selectLimit.mockReset();
		selectLimit
			.mockResolvedValueOnce([
				{
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
				},
			])
			.mockResolvedValueOnce([
				{
					status: "succeeded",
					version: "latest",
					updatedAt: new Date("2026-05-26T03:00:00.000Z"),
				},
			])
			.mockResolvedValueOnce([
				{
					id: "audit_2",
					action: "server.action.update.succeeded",
					details: {
						serverId: "server_123",
						message: "Updated Hermes to the latest image successfully.",
					},
					createdAt: new Date("2026-05-26T03:10:00.000Z"),
				},
				{
					id: "audit_1",
					action: "server.action.restart.failed",
					details: {
						serverId: "server_123",
						message: "Action failed: host unreachable",
					},
					createdAt: new Date("2026-05-26T03:05:00.000Z"),
				},
			]);

		const { getServerDetailSnapshot } = await import("./server-actions");
		const detail = await getServerDetailSnapshot({
			serverId: "server_123",
			userId: "user_123",
		});

		expect(detail).toMatchObject({
			server: {
				id: "server_123",
				label: "Prod VPS",
				host: "203.0.113.10",
				osName: "Ubuntu",
			},
			install: {
				status: "succeeded",
				version: "latest",
			},
			actionHistory: [
				{
					action: "update",
					result: "succeeded",
				},
				{
					action: "restart",
					result: "failed",
				},
			],
		});
	});

	it("runs update actions over SSH and records audit history", async () => {
		const execCommand = vi.fn().mockResolvedValue({
			code: 0,
			stdout: "ok",
			stderr: "",
		});
		withSshConnection.mockImplementation(async (_input, run) =>
			run({ execCommand }),
		);

		const { runServerAction } = await import("./server-actions");
		const response = await runServerAction(createContext({ action: "update" }));

		expect(execCommand).toHaveBeenCalledWith(
			"cd ~/hermes && sudo docker compose pull hermes && sudo docker compose up -d --no-deps hermes",
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "succeeded",
			action: "update",
		});
		expect(insertAuditValues).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				action: "server.action.update.started",
			}),
		);
		expect(insertAuditValues).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				action: "server.action.update.succeeded",
			}),
		);
	});

	it("runs rollback with an explicit target version", async () => {
		const execCommand = vi.fn().mockResolvedValue({
			code: 0,
			stdout: "ok",
			stderr: "",
		});
		withSshConnection.mockImplementation(async (_input, run) =>
			run({ execCommand }),
		);

		const { runServerAction } = await import("./server-actions");
		const response = await runServerAction(
			createContext({ action: "rollback", targetVersion: "v1.2.3" }),
		);

		expect(execCommand).toHaveBeenCalledWith(
			[
				"cd ~/hermes",
				"sudo docker pull nousresearch/hermes-agent:v1.2.3",
				"sudo sed -i.bak 's|image: nousresearch/hermes-agent:.*|image: nousresearch/hermes-agent:v1.2.3|' docker-compose.yml",
				"sudo docker compose up -d --no-deps hermes",
			].join(" && "),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "succeeded",
			action: "rollback",
			imageRef: "v1.2.3",
		});
		expect(insertAuditValues).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				action: "server.action.rollback.started",
				details: expect.objectContaining({ imageRef: "v1.2.3" }),
			}),
		);
	});

	it("rollback auto-resolves the version from the installs table when no target is given", async () => {
		// selectLimit returns: [server], [install version], [install id for update]
		selectLimit.mockReset();
		selectLimit
			.mockResolvedValueOnce([
				{
					id: "server_123",
					label: "Prod VPS",
					host: "203.0.113.10",
					port: 22,
					username: "root",
					authMethod: "password",
					encryptedCredential: "encrypted-secret",
					storeCredential: true,
					status: "connected",
					osInfo: {},
				},
			])
			.mockResolvedValueOnce([{ version: "v1.0.0" }])
			.mockResolvedValueOnce([{ id: "install_123" }]);

		const { runServerAction } = await import("./server-actions");
		const response = await runServerAction(
			createContext({ action: "rollback" }),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "succeeded",
			action: "rollback",
			imageRef: "v1.0.0",
		});
	});

	it("rejects rollback with a shell-injectable target version", async () => {
		const { runServerAction } = await import("./server-actions");
		const response = await runServerAction(
			createContext({
				action: "rollback",
				targetVersion: "v1.0.0; rm -rf /",
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining("Invalid target version"),
		});
		expect(withSshConnection).not.toHaveBeenCalled();
		expect(insertAuditValues).not.toHaveBeenCalled();
	});

	it("rejects an unknown action type", async () => {
		const { runServerAction } = await import("./server-actions");
		const response = await runServerAction(createContext({ action: "reboot" }));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Action must be restart, update, or rollback",
		});
		expect(withSshConnection).not.toHaveBeenCalled();
	});

	it("records a failed audit log when an SSH command fails", async () => {
		mockSshExec(async () => ({
			code: 1,
			stdout: "",
			stderr: "Container error",
		}));

		insertAuditValues.mockClear();
		const { runServerAction } = await import("./server-actions");
		const response = await runServerAction(
			createContext({ action: "restart" }),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: expect.stringContaining("Container error"),
		});
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "server.action.restart.failed",
			}),
		);
	});

	it("serves server detail through the HTTP endpoint", async () => {
		selectLimit.mockReset();
		selectLimit
			.mockResolvedValueOnce([
				{
					id: "server_123",
					label: "Prod VPS",
					host: "203.0.113.10",
					port: 22,
					username: "root",
					authMethod: "password",
					encryptedCredential: "encrypted-secret",
					storeCredential: true,
					status: "connected",
					osInfo: { name: "Ubuntu" },
				},
			])
			.mockResolvedValueOnce([
				{
					status: "succeeded",
					version: "latest",
					updatedAt: new Date(),
				},
			])
			.mockResolvedValueOnce([]);

		const { getServerDetail } = await import("./server-actions");
		const response = await getServerDetail(
			createContext({ action: "restart" }),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toHaveProperty("serverDetail");
		expect(body.serverDetail.server.label).toBe("Prod VPS");
	});
});

it("getRollbackTargetFromHistory returns first successful rollback imageRef or null", async () => {
	const { getRollbackTargetFromHistory } = await import("./server-actions");

	expect(
		getRollbackTargetFromHistory([
			{
				id: "history_1",
				action: "rollback",
				result: "succeeded",
				imageRef: "v1",
				message: "Rolled back to v1",
				createdAt: "2026-05-29T00:00:00.000Z",
			},
			{
				id: "history_2",
				action: "rollback",
				result: "succeeded",
				imageRef: "v2",
				message: "Rolled back to v2",
				createdAt: "2026-05-28T00:00:00.000Z",
			},
		]),
	).toBe("v1");

	expect(getRollbackTargetFromHistory([])).toBeNull();
});

function createContext(payload: Record<string, unknown>) {
	return {
		req: {
			raw: new Request("http://localhost/api/servers/server_123/actions", {
				method: "POST",
				body: JSON.stringify(payload),
				headers: { "content-type": "application/json" },
			}),
			header: () => null,
			param: (name: string) => (name === "id" ? "server_123" : undefined),
			json: async () => payload,
		},
		json: (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as never;
}
