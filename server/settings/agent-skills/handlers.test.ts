import { describe, expect, it, vi } from "vitest";

import {
	baseRecord,
	createContext,
	setupAgentSkillsTestState,
} from "./test-helpers";

const {
	requireAuthSession,
	dbSelect,
	dbInsert,
	dbUpdate,
	dbDelete,
	transaction,
	selectFrom,
	selectWhere,
	selectOrderBy,
	selectLimit,
	insertValues,
	updateSet,
	updateWhere,
	updateReturning,
	deleteWhere,
	deleteReturning,
	insertAuditValues,
} = vi.hoisted(() => ({
	requireAuthSession: vi.fn(),
	dbSelect: vi.fn(),
	dbInsert: vi.fn(),
	dbUpdate: vi.fn(),
	dbDelete: vi.fn(),
	transaction: vi.fn(),
	selectFrom: vi.fn(),
	selectWhere: vi.fn(),
	selectOrderBy: vi.fn(),
	selectLimit: vi.fn(),
	insertValues: vi.fn(),
	updateSet: vi.fn(),
	updateWhere: vi.fn(),
	updateReturning: vi.fn(),
	deleteWhere: vi.fn(),
	deleteReturning: vi.fn(),
	insertAuditValues: vi.fn(),
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

setupAgentSkillsTestState({
	requireAuthSession,
	dbSelect,
	dbInsert,
	dbUpdate,
	dbDelete,
	transaction,
	selectFrom,
	selectWhere,
	selectOrderBy,
	selectLimit,
	insertValues,
	updateSet,
	updateWhere,
	updateReturning,
	deleteWhere,
	deleteReturning,
	insertAuditValues,
	withSshConnection: vi.fn(),
	restartGateway: vi.fn(),
	resolveHermesDeployContext: vi.fn(),
});

describe("agent skills handlers", () => {
	describe("createAgentSkill", () => {
		it("creates a hub skill with valid input", async () => {
			selectLimit.mockResolvedValueOnce([]);

			const { createAgentSkill } = await import("../agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "my-skill",
					sourceType: "hub",
					installRef: "nous/my-skill",
				}),
			);

			expect(response.status).toBe(200);
			const payload = await response.json();
			expect(payload.skill.name).toBe("test-skill");
			expect(insertValues).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "my-skill",
					sourceType: "hub",
					installRef: "nous/my-skill",
				}),
			);
			expect(insertAuditValues).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "agent_skill.created",
				}),
			);
		});

		it("creates a hub skill from a registry hub ID with dots", async () => {
			selectLimit.mockResolvedValueOnce([]);

			const { createAgentSkill } = await import("../agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "get-forecast",
					sourceType: "hub",
					installRef: "browse-sh/weather.gov/get-forecast-1uezib",
				}),
			);

			expect(response.status).toBe(200);
			expect(insertValues).toHaveBeenCalledWith(
				expect.objectContaining({
					sourceType: "hub",
					installRef: "browse-sh/weather.gov/get-forecast-1uezib",
				}),
			);
		});

		it("returns 400 when name is invalid", async () => {
			const { createAgentSkill } = await import("../agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "1-invalid-name",
					sourceType: "hub",
					installRef: "nous/my-skill",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error:
					"Skill name must start with a letter and contain only letters, numbers, underscores, or hyphens.",
			});
		});

		it("returns 400 when hub installRef has newlines", async () => {
			const { createAgentSkill } = await import("../agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "my-skill",
					sourceType: "hub",
					installRef: "nous/my-skill\nbreak",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error:
					"installRef for hub skills must be a valid repository or package reference (e.g., owner/repo or owner/repo@version).",
			});
		});

		it("returns 400 when hub installRef has invalid characters", async () => {
			const { createAgentSkill } = await import("../agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "my-skill",
					sourceType: "hub",
					installRef: "nous/my skill; rm -rf /",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error:
					"installRef for hub skills must be a valid repository or package reference (e.g., owner/repo or owner/repo@version).",
			});
		});

		it("returns 400 when url installRef is invalid URL", async () => {
			const { createAgentSkill } = await import("../agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "my-skill",
					sourceType: "url",
					installRef: "not-a-url",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "installRef for url skills must be a valid http or https URL.",
			});
		});

		it("returns 400 when custom content is empty", async () => {
			const { createAgentSkill } = await import("../agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "my-skill",
					sourceType: "custom",
					content: "   ",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "content is required for custom skills.",
			});
		});

		it("returns 400 when unique name conflict occurs", async () => {
			selectLimit.mockResolvedValueOnce([baseRecord]);

			const { createAgentSkill } = await import("../agent-skills");
			const response = await createAgentSkill(
				createContext({
					name: "test-skill",
					sourceType: "hub",
					installRef: "nous/test-skill",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				error: "An agent skill with this name already exists.",
			});
		});
	});

	describe("updateAgentSkill", () => {
		it("updates an existing skill", async () => {
			selectLimit.mockResolvedValueOnce([baseRecord]);

			const { updateAgentSkill } = await import("../agent-skills");
			const response = await updateAgentSkill(
				createContext({ enabled: false }, "PUT", "skill_1"),
			);

			expect(response.status).toBe(200);
			expect(updateSet).toHaveBeenCalledWith(
				expect.objectContaining({
					enabled: false,
				}),
			);
			expect(insertAuditValues).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "agent_skill.updated",
				}),
			);
		});

		it("returns 404 when skill does not exist", async () => {
			selectLimit.mockResolvedValueOnce([]);

			const { updateAgentSkill } = await import("../agent-skills");
			const response = await updateAgentSkill(
				createContext({ enabled: false }, "PUT", "skill_invalid"),
			);

			expect(response.status).toBe(404);
		});
	});

	describe("deleteAgentSkill", () => {
		it("deletes a skill and logs audit action", async () => {
			selectLimit.mockResolvedValueOnce([baseRecord]);

			const { deleteAgentSkill } = await import("../agent-skills");
			const response = await deleteAgentSkill(
				createContext(null, "DELETE", "skill_1"),
			);

			expect(response.status).toBe(200);
			expect(dbDelete).toHaveBeenCalled();
			expect(insertAuditValues).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "agent_skill.deleted",
				}),
			);
		});
	});
});
