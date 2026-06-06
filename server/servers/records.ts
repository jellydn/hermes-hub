import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { FINISHED_SERVER_ACTION_NAMES } from "../audit-log-actions";
import { getDb } from "../db";
import { auditLogs, installs, servers } from "../db/schema";

export type ServerListRecord = {
	id: string;
	label: string;
	host: string;
	status: string;
	osInfo: Record<string, unknown>;
	updatedAt: Date;
};

export type InstallListRecord = {
	serverId: string;
	status: string;
	updatedAt: Date;
};

export type ServerActionRecord = {
	serverId: string;
	action: string;
	details: unknown;
	createdAt: Date;
};

export async function getOwnedServerListRecords(userId: string) {
	const records = await getDb()
		.select({
			id: servers.id,
			label: servers.label,
			host: servers.host,
			status: servers.status,
			osInfo: servers.osInfo,
			updatedAt: servers.updatedAt,
		})
		.from(servers)
		.where(eq(servers.userId, userId))
		.orderBy(desc(servers.createdAt));

	return records as ServerListRecord[];
}

export async function getLatestInstallRecords(serverIds: string[]) {
	const records = await getDb()
		.select({
			serverId: installs.serverId,
			status: installs.status,
			updatedAt: installs.updatedAt,
		})
		.from(installs)
		.where(inArray(installs.serverId, serverIds))
		.orderBy(desc(installs.createdAt));

	return records as InstallListRecord[];
}

export async function getLatestServerActionRecords(
	userId: string,
	serverIds: string[],
): Promise<ServerActionRecord[]> {
	const db = getDb();
	const ranked = db
		.select({
			serverId: auditLogs.serverId,
			action: auditLogs.action,
			details: auditLogs.details,
			createdAt: auditLogs.createdAt,
			rowNum:
				sql<number>`row_number() over (partition by ${auditLogs.serverId} order by ${auditLogs.createdAt} desc)`.as(
					"rn",
				),
		})
		.from(auditLogs)
		.where(
			and(
				eq(auditLogs.userId, userId),
				inArray(auditLogs.action, FINISHED_SERVER_ACTION_NAMES),
				inArray(auditLogs.serverId, serverIds),
			),
		)
		.as("ranked");

	const records = await db
		.select({
			serverId: ranked.serverId,
			action: ranked.action,
			details: ranked.details,
			createdAt: ranked.createdAt,
		})
		.from(ranked)
		.where(eq(ranked.rowNum, 1));

	return records.filter(
		(r): r is typeof r & { serverId: string } => r.serverId !== null,
	);
}
