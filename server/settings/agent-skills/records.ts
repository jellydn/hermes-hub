import { and, asc, eq } from "drizzle-orm";

import { getDb } from "#server/db";
import { agentSkills } from "#server/db/schema";
import type {
	AgentSkillRequest,
	AgentSkillSummary,
	SkillSourceType,
} from "./config";
import { toAgentSkillSummary } from "./config";

type DbWriter = Pick<
	ReturnType<typeof getDb>,
	"select" | "insert" | "update" | "delete"
>;

export type StoredAgentSkillRecord = typeof agentSkills.$inferSelect;

export async function listAgentSkillRecords(
	userId: string,
): Promise<StoredAgentSkillRecord[]> {
	const db = getDb();

	return db
		.select()
		.from(agentSkills)
		.where(eq(agentSkills.userId, userId))
		.orderBy(asc(agentSkills.name));
}

export async function getCurrentAgentSkills(
	userId: string,
): Promise<AgentSkillSummary[]> {
	const records = await listAgentSkillRecords(userId);
	return records.map(toAgentSkillSummary);
}

export async function getOwnedAgentSkillRecord(
	userId: string,
	skillId: string,
): Promise<StoredAgentSkillRecord | null> {
	const db = getDb();

	const [record] = await db
		.select()
		.from(agentSkills)
		.where(and(eq(agentSkills.userId, userId), eq(agentSkills.id, skillId)))
		.limit(1);

	return record ?? null;
}

export async function getAgentSkillByName(
	userId: string,
	name: string,
): Promise<StoredAgentSkillRecord | null> {
	const db = getDb();

	const [record] = await db
		.select()
		.from(agentSkills)
		.where(and(eq(agentSkills.userId, userId), eq(agentSkills.name, name)))
		.limit(1);

	return record ?? null;
}

type CreateAgentSkillInput = {
	userId: string;
	name: string;
	sourceType: SkillSourceType;
	installRef: string | null;
	content: string | null;
	enabled: boolean;
};

export async function createAgentSkillRecord(
	writer: DbWriter,
	input: CreateAgentSkillInput,
): Promise<AgentSkillSummary> {
	const [record] = await writer
		.insert(agentSkills)
		.values({
			userId: input.userId,
			name: input.name,
			sourceType: input.sourceType,
			installRef: input.installRef,
			content: input.content,
			enabled: input.enabled,
		})
		.returning();

	if (!record) {
		throw new Error("Unable to create agent skill.");
	}

	return toAgentSkillSummary(record);
}

type UpdateAgentSkillInput = {
	skillId: string;
	userId: string;
	updates: AgentSkillRequest;
};

export async function updateAgentSkillRecord(
	writer: DbWriter,
	input: UpdateAgentSkillInput,
): Promise<AgentSkillSummary> {
	const updateFields: Partial<typeof agentSkills.$inferInsert> = {
		updatedAt: new Date(),
	};
	if (input.updates.name !== undefined) {
		updateFields.name = input.updates.name;
	}
	if (input.updates.enabled !== undefined) {
		updateFields.enabled = input.updates.enabled;
	}
	if (input.updates.installRef !== undefined) {
		updateFields.installRef = input.updates.installRef;
	}
	if (input.updates.content !== undefined) {
		updateFields.content = input.updates.content;
	}

	const [record] = await writer
		.update(agentSkills)
		.set(updateFields)
		.where(
			and(
				eq(agentSkills.userId, input.userId),
				eq(agentSkills.id, input.skillId),
			),
		)
		.returning();

	if (!record) {
		throw new Error("Unable to update agent skill.");
	}

	return toAgentSkillSummary(record);
}

export async function deleteAgentSkillRecord(
	writer: DbWriter,
	userId: string,
	skillId: string,
): Promise<StoredAgentSkillRecord | null> {
	const [record] = await writer
		.delete(agentSkills)
		.where(and(eq(agentSkills.userId, userId), eq(agentSkills.id, skillId)))
		.returning();

	return record ?? null;
}
