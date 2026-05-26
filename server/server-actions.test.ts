import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthSession = vi.fn();
const getEphemeralCredential = vi.fn();
const decryptSecret = vi.fn();
const withSshConnection = vi.fn();
const dbInsert = vi.fn();
const dbSelect = vi.fn();
const dbUpdate = vi.fn();
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
	getEphemeralCredential,
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
	}),
}));

describe("server actions", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		getAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});

		dbInsert.mockReturnValue({ values: insertAuditValues });
		insertAuditValues.mockResolvedValue(undefined);

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue({ orderBy: selectOrderBy, limit: selectLimit });
		selectOrderBy.mockReturnValue({ limit: selectLimit });

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

		withSshConnection.mockImplementation(async (_input, run) => {
			const execCommand = vi
				.fn()
				.mockResolvedValue({ code: 0, stdout: "ok", stderr: "" });
			return run({ execCommand });
		});
	});

	it("runs restart actions over SSH and records audit history", async () => {
		const { runServerAction } = await import("./server-actions");
		const response = await runServerAction(
			createContext({ action: "restart" }),
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
		getEphemeralCredential.mockReturnValue(null);

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
