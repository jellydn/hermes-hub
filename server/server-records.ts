import { and, eq } from "drizzle-orm";

import { getSessionCredential } from "./credentials";
import { decryptSecret } from "./crypto";
import { getDb } from "./db";
import { servers } from "./db/schema";
import type { SshAuthMethod, VerifiedServerInfo } from "./ssh";

export type OwnedServerRecord = {
	id: string;
	label: string;
	host: string;
	port: number;
	username: string;
	authMethod: string;
	encryptedCredential: string | null;
	storeCredential: boolean;
	status: string;
	osInfo: Record<string, unknown>;
};

export async function getOwnedServerRecord(input: {
	serverId: string;
	userId: string;
}) {
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
		})
		.from(servers)
		.where(
			and(eq(servers.id, input.serverId), eq(servers.userId, input.userId)),
		)
		.limit(1);

	return (serverRecord as OwnedServerRecord | undefined) ?? null;
}

export function resolveServerCredential(
	serverRecord: Pick<OwnedServerRecord, "id" | "encryptedCredential" | "storeCredential">,
	sessionId?: string | null,
) {
	if (serverRecord.storeCredential) {
		if (!serverRecord.encryptedCredential) {
			throw new Error("Stored credential is missing.");
		}

		return decryptSecret(serverRecord.encryptedCredential);
	}

	if (!sessionId) {
		throw new Error(
			"Temporary credential expired. Reconnect the server first.",
		);
	}

	const ephemeralCredential = getSessionCredential(serverRecord.id, sessionId);
	if (!ephemeralCredential) {
		throw new Error(
			"Temporary credential expired. Reconnect the server first.",
		);
	}

	return ephemeralCredential.credential;
}

export function normalizeAuthMethod(authMethod: string): SshAuthMethod | null {
	if (authMethod === "password" || authMethod === "ssh-key") {
		return authMethod;
	}

	return null;
}

export function buildOsInfo(verified: VerifiedServerInfo) {
	return {
		name: verified.osName,
		version: verified.osVersion,
		architecture: verified.architecture,
		supportLevel: verified.supportLevel,
		raw: verified.raw,
	};
}
