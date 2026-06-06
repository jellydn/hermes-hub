import { eq } from "drizzle-orm";

import { getDb } from "../db";
import { hermesSettings } from "../db/schema";
import {
	type PersonaSettingsSummary,
	toPersonaSettingsSummary,
} from "./config";

export type { PersonaSettingsSummary };

export async function getHermesSettingsRecord(userId: string) {
	const [record] = await getDb()
		.select({
			agentPersona: hermesSettings.agentPersona,
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

	return toPersonaSettingsSummary(record);
}

type DbClient = Pick<ReturnType<typeof getDb>, "insert">;

export async function upsertHermesSettingsRecord(
	db: DbClient,
	input: {
		userId: string;
		agentPersona: string;
	},
): Promise<PersonaSettingsSummary> {
	const now = new Date();

	await db
		.insert(hermesSettings)
		.values({
			userId: input.userId,
			agentPersona: input.agentPersona,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: hermesSettings.userId,
			set: {
				agentPersona: input.agentPersona,
				updatedAt: now,
			},
		});

	return toPersonaSettingsSummary({
		agentPersona: input.agentPersona,
		updatedAt: now,
	});
}
