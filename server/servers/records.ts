import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { installs, servers } from "../db/schema";

const relevantServerActionNames = [
	"server.connect.succeeded",
	"server.connect.failed",
	"server.update.succeeded",
	"server.update.failed",
	"server.action.restart.succeeded",
	"server.action.restart.failed",
	"server.action.update.succeeded",
	"server.action.update.failed",
	"server.action.rollback.succeeded",
	"server.action.rollback.failed",
] as const;

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
	action: string;
	details: unknown;
	createdAt: Date;
};

export async function getStoredServerCredential(input: {
	serverId: string;
	userId: string;
}) {
	const [serverRecord] = await getDb()
		.select({
			id: servers.id,
			authMethod: servers.authMethod,
			encryptedCredential: servers.encryptedCredential,
			storeCredential: servers.storeCredential,
		})
		.from(servers)
		.where(
			and(eq(servers.id, input.serverId), eq(servers.userId, input.userId)),
		)
		.limit(1);

	return serverRecord ?? null;
}

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
) {
	// Use DISTINCT ON to get the latest action per server, eliminating the
	// previous LIMIT 100 + JSON filter approach that could miss recency.
	const records = await getDb().execute<{
		action: string;
		details: unknown;
		created_at: Date;
	}>(sql`
		SELECT DISTINCT ON (server_id) action, details, created_at
		FROM audit_logs
		WHERE user_id = ${userId}
			AND action IN ${sql.join(relevantServerActionNames.map((name) => sql`${name}`))}
			AND server_id IN ${sql.join(serverIds.map((id) => sql`${id}`))}
		ORDER BY server_id, created_at DESC
	`);

	return records.map((record) => ({
		action: record.action,
		details: record.details,
		createdAt: record.created_at,
	})) as ServerActionRecord[];
}
