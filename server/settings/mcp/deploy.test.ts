import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	baseRecord,
	createContext,
	dbDelete,
	dbInsert,
	dbSelect,
	dbUpdate,
	decryptSecret,
	encryptSecret,
	getAuthSession,
	insertAuditValues,
	readHermesConfigYaml,
	requireAuthSession,
	resolveHermesDeployContext,
	restartGateway,
	selectOrderBy,
	setupMcpMocks,
	transaction,
	withSshConnection,
	writeHermesConfigYaml,
} from "./test-helpers";

vi.mock("../../auth", () => ({
	getAuthSession,
}));

vi.mock("../../crypto", () => ({
	encryptSecret,
	decryptSecret,
}));

vi.mock("../../db", () => ({
	getDb: () => ({
		select: dbSelect,
		insert: dbInsert,
		update: dbUpdate,
		delete: dbDelete,
		transaction,
	}),
}));

vi.mock("../../request-guards", () => ({
	requireAuthSession,
}));

vi.mock(
	"../../ssh",
	async (importOriginal: () => Promise<typeof import("../../ssh")>) => {
		const actual = await importOriginal();
		return {
			...actual,
			withSshConnection,
		};
	},
);

vi.mock("../../hermes/mcp-config", () => ({
	readHermesConfigYaml,
	writeHermesConfigYaml,
}));

vi.mock("../../hermes/runtime", () => ({
	restartGateway,
}));

vi.mock("../../hermes/deploy-context", () => ({
	resolveHermesDeployContext,
}));

describe("mcp deploy", () => {
	beforeEach(() => {
		setupMcpMocks();
	});

	it("deploys MCP settings over SSH and records success audit logs", async () => {
		selectOrderBy.mockResolvedValueOnce([baseRecord]);

		const { deployMcpServersToHermes } = await import("../mcp");
		const response = await deployMcpServersToHermes(
			createContext(null, "POST"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "deployed",
			serverId: "server_1",
			serverHost: "1.2.3.4",
		});
		expect(writeHermesConfigYaml).toHaveBeenCalled();
		expect(restartGateway).toHaveBeenCalled();
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "mcp.deployed",
			}),
		);
	});

	it("passes the selected serverId to the deploy resolver", async () => {
		selectOrderBy.mockResolvedValueOnce([baseRecord]);

		const { deployMcpServersToHermes } = await import("../mcp");
		const response = await deployMcpServersToHermes(
			createContext({ serverId: "server_2" }, "POST"),
		);

		expect(response.status).toBe(200);
		expect(resolveHermesDeployContext).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				user: expect.objectContaining({ id: "user_123" }),
			}),
			"server_2",
		);
	});

	it("returns 502 without writing remote config when existing YAML is invalid", async () => {
		selectOrderBy.mockResolvedValueOnce([baseRecord]);
		readHermesConfigYaml.mockResolvedValueOnce("model: [broken");

		const { deployMcpServersToHermes } = await import("../mcp");
		const response = await deployMcpServersToHermes(
			createContext(null, "POST"),
		);

		expect(response.status).toBe(502);
		expect(writeHermesConfigYaml).not.toHaveBeenCalled();
		expect(restartGateway).not.toHaveBeenCalled();
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "mcp.deploy.failed",
			}),
		);
	});

	it("returns 502 and records deploy failure when SSH write fails", async () => {
		selectOrderBy.mockResolvedValueOnce([baseRecord]);
		writeHermesConfigYaml.mockRejectedValueOnce(new Error("SSH write failed"));

		const { deployMcpServersToHermes } = await import("../mcp");
		const response = await deployMcpServersToHermes(
			createContext(null, "POST"),
		);

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: "Deploy failed: SSH write failed",
		});
		expect(insertAuditValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "mcp.deploy.failed",
			}),
		);
	});
});
