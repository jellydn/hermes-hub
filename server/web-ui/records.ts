import { eq } from "drizzle-orm";

import { decryptSecret } from "../crypto";
import { getDb } from "../db";
import { serverWebUi } from "../db/schema";

export type ServerWebUiRecord = {
	enabled: boolean;
	encryptedPassword: string | null;
	port: number;
	deployStatus: string;
	deployError: string | null;
	deployStartedAt: Date | null;
	updatedAt: Date;
};

export function getWebUiProxyPath(serverId: string) {
	return `/api/servers/${serverId}/web-ui/proxy/`;
}

export async function getServerWebUiRecord(
	serverId: string,
): Promise<ServerWebUiRecord | null> {
	const [record] = await getDb()
		.select({
			enabled: serverWebUi.enabled,
			encryptedPassword: serverWebUi.encryptedPassword,
			port: serverWebUi.port,
			deployStatus: serverWebUi.deployStatus,
			deployError: serverWebUi.deployError,
			deployStartedAt: serverWebUi.deployStartedAt,
			updatedAt: serverWebUi.updatedAt,
		})
		.from(serverWebUi)
		.where(eq(serverWebUi.serverId, serverId))
		.limit(1);

	return record ?? null;
}

export function decryptWebUiPassword(encryptedPassword: string | null) {
	if (!encryptedPassword) {
		return null;
	}

	try {
		return decryptSecret(encryptedPassword);
	} catch {
		return null;
	}
}
