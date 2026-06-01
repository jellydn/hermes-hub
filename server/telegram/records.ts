import { and, desc, eq } from "drizzle-orm";
import { decryptSecret } from "../crypto";
import { getDb } from "../db";
import { installs, servers, telegramConfigs } from "../db/schema";
import type { TelegramConfigSummary } from "./config";
import { getTokenLast4 } from "./config";

export async function getCurrentTelegramConfig(userId: string) {
	const record = await getLatestTelegramRecord(userId);
	if (!record?.isActive) {
		return null;
	}

	let decryptedToken: string;
	try {
		decryptedToken = decryptSecret(record.botToken);
	} catch {
		decryptedToken = "";
	}

	return {
		botUsername: record.botUsername || "Connected bot",
		botTokenLast4: getTokenLast4(decryptedToken),
		isActive: true,
		deployedServerHost: record.deployedServerHost ?? null,
	} satisfies TelegramConfigSummary;
}

export async function getLatestTelegramRecord(userId: string) {
	const [record] = await getDb()
		.select({
			botToken: telegramConfigs.botToken,
			botUsername: telegramConfigs.botUsername,
			isActive: telegramConfigs.isActive,
			deployedServerId: telegramConfigs.deployedServerId,
			deployedServerHost: telegramConfigs.deployedServerHost,
			apiServerKey: telegramConfigs.apiServerKey,
		})
		.from(telegramConfigs)
		.where(eq(telegramConfigs.userId, userId))
		.orderBy(desc(telegramConfigs.createdAt))
		.limit(1);

	return record ?? null;
}

export async function findServerForDeploy(userId: string) {
	const [row] = await getDb()
		.select({
			id: servers.id,
			host: servers.host,
			port: servers.port,
			username: servers.username,
			authMethod: servers.authMethod,
			encryptedCredential: servers.encryptedCredential,
			storeCredential: servers.storeCredential,
			hostKeyFingerprint: servers.hostKeyFingerprint,
		})
		.from(installs)
		.innerJoin(servers, eq(installs.serverId, servers.id))
		.where(and(eq(servers.userId, userId), eq(installs.status, "succeeded")))
		.orderBy(desc(installs.createdAt))
		.limit(1);

	return row ?? null;
}
