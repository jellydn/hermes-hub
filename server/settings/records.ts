import { eq } from "drizzle-orm";

import { getDb } from "../db";
import { hermesSettings } from "../db/schema";

export type PersonaSettingsSummary = {
	agentPersona: string;
	deployedServerHost: string | null;
	deployedAt: string | null;
	updatedAt: string;
};

export async function getHermesSettingsRecord(userId: string) {
	const [record] = await getDb()
		.select({
			agentPersona: hermesSettings.agentPersona,
			deployedServerId: hermesSettings.deployedServerId,
			deployedServerHost: hermesSettings.deployedServerHost,
			deployedAt: hermesSettings.deployedAt,
			updatedAt: hermesSettings.updatedAt,
		})
		.from(hermesSettings)
		.where(eq(hermesSettings.userId, userId))
		.limit(1);

	return record ?? null;
}

export async function getCurrentPersonaSettings(
	userId: string,
): Promise<PersonaSettingsSummary | null> {
	const record = await getHermesSettingsRecord(userId);
	if (!record) {
		return null;
	}

	return {
		agentPersona: record.agentPersona,
		deployedServerHost: record.deployedServerHost ?? null,
		deployedAt: record.deployedAt?.toISOString() ?? null,
		updatedAt: record.updatedAt.toISOString(),
	};
}

type DbClient = Pick<ReturnType<typeof getDb>, "insert">;

export async function upsertHermesSettingsRecord(
	db: DbClient,
	input: {
		userId: string;
		agentPersona: string;
		deployedServerId?: string | null;
		deployedServerHost?: string | null;
		deployedAt?: Date | null;
	},
): Promise<void> {
	const now = new Date();
	const updateSet: Partial<typeof hermesSettings.$inferInsert> = {
		agentPersona: input.agentPersona,
		updatedAt: now,
	};

	if (input.deployedServerId !== undefined) {
		updateSet.deployedServerId = input.deployedServerId;
	}
	if (input.deployedServerHost !== undefined) {
		updateSet.deployedServerHost = input.deployedServerHost;
	}
	if (input.deployedAt !== undefined) {
		updateSet.deployedAt = input.deployedAt;
	}

	await db
		.insert(hermesSettings)
		.values({
			userId: input.userId,
			agentPersona: input.agentPersona,
			deployedServerId: input.deployedServerId ?? null,
			deployedServerHost: input.deployedServerHost ?? null,
			deployedAt: input.deployedAt ?? null,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: hermesSettings.userId,
			set: updateSet,
		});
}
