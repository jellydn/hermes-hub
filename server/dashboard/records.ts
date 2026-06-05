import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { aiProviders, installs, servers, telegramConfigs } from "../db/schema";
import type { ServerRecord } from "./summaries";

export async function getLatestServer(userId: string) {
	const [serverRecord] = await getDb()
		.select({
			id: servers.id,
			label: servers.label,
			host: servers.host,
			port: servers.port,
			username: servers.username,
			authMethod: servers.authMethod,
			encryptedCredential: servers.encryptedCredential,
			storeCredential: servers.storeCredential,
			status: servers.status,
			osInfo: servers.osInfo,
			updatedAt: servers.updatedAt,
			hostKeyFingerprint: servers.hostKeyFingerprint,
		})
		.from(servers)
		.where(eq(servers.userId, userId))
		.orderBy(desc(servers.createdAt))
		.limit(1);

	return (serverRecord as ServerRecord | undefined) ?? null;
}

export async function getServerCount(userId: string) {
	const [result] = await getDb()
		.select({ count: sql<number>`count(*)` })
		.from(servers)
		.where(eq(servers.userId, userId));

	return result ? Number(result.count) : 0;
}

export async function getLatestInstall(serverId: string) {
	const [installRecord] = await getDb()
		.select({
			status: installs.status,
			updatedAt: installs.updatedAt,
		})
		.from(installs)
		.where(eq(installs.serverId, serverId))
		.orderBy(desc(installs.createdAt))
		.limit(1);

	return installRecord ?? null;
}

export async function getLatestProvider(userId: string) {
	const [providerRecord] = await getDb()
		.select({
			provider: aiProviders.provider,
			model: aiProviders.model,
			isActive: aiProviders.isActive,
		})
		.from(aiProviders)
		.where(eq(aiProviders.userId, userId))
		.orderBy(desc(aiProviders.createdAt))
		.limit(1);

	return providerRecord ?? null;
}

export async function getLatestTelegram(userId: string) {
	const [telegramRecord] = await getDb()
		.select({
			botUsername: telegramConfigs.botUsername,
			isActive: telegramConfigs.isActive,
		})
		.from(telegramConfigs)
		.where(eq(telegramConfigs.userId, userId))
		.orderBy(desc(telegramConfigs.createdAt))
		.limit(1);

	return telegramRecord ?? null;
}
