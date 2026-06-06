import { and, eq } from "drizzle-orm";
import { getSessionCredential } from "./credentials";
import { decryptSecret } from "./crypto";
import { getDb } from "./db";
import { servers } from "./db/schema";
import { getNonEmptyString } from "./lib/non-empty-string";
import type { SshAuthMethod, VerifiedServerInfo } from "./ssh";

/** Minimal server fields needed for SSH connections (no ownership/status). */
export type ServerConnectionRecord = {
	id: string;
	host: string;
	port: number;
	username: string;
	authMethod: string;
	encryptedCredential: string | null;
	storeCredential: boolean;
	hostKeyFingerprint: string | null;
};

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
	hostKeyFingerprint: string | null;
	hostKeyAlgorithm: string | null;
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
			hostKeyFingerprint: servers.hostKeyFingerprint,
			hostKeyAlgorithm: servers.hostKeyAlgorithm,
		})
		.from(servers)
		.where(
			and(eq(servers.id, input.serverId), eq(servers.userId, input.userId)),
		)
		.limit(1);

	return (serverRecord as OwnedServerRecord | undefined) ?? null;
}

export function resolveServerCredential(
	serverRecord: Pick<
		OwnedServerRecord,
		"id" | "encryptedCredential" | "storeCredential"
	>,
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

export function readOsInfoValue(
	osInfo: Record<string, unknown> | null | undefined,
	key: string,
): string | null {
	if (!osInfo) {
		return null;
	}
	return getNonEmptyString(osInfo[key]);
}

export function resolveServerSshConfig(
	serverRecord: Pick<
		OwnedServerRecord,
		| "id"
		| "host"
		| "port"
		| "username"
		| "authMethod"
		| "encryptedCredential"
		| "storeCredential"
	>,
	sessionId?: string | null,
): { authMethod: SshAuthMethod; credential: string } {
	const authMethod = normalizeAuthMethod(serverRecord.authMethod);
	if (!authMethod) {
		throw new Error("Unsupported authentication method.");
	}

	const credential = resolveServerCredential(serverRecord, sessionId);

	return { authMethod, credential };
}

/**
 * Looks up a server by ID (without ownership check).
 * Used by telegram deploy, provider deploy, and pairings to resolve a
 * previously-stored deployedServerId.
 */
export async function getServerById(
	serverId: string,
): Promise<ServerConnectionRecord | null> {
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
		.from(servers)
		.where(eq(servers.id, serverId))
		.limit(1);

	return row ?? null;
}

/**
 * Resolves SSH config, returning a discriminated result instead of throwing.
 * Eliminates the repeated try/catch boilerplate at every SSH call site.
 */
export function resolveServerSshConfigOrError(
	serverRecord: Parameters<typeof resolveServerSshConfig>[0],
	sessionId: string | null | undefined,
):
	| { ok: true; authMethod: SshAuthMethod; credential: string }
	| { ok: false; error: string } {
	try {
		const config = resolveServerSshConfig(serverRecord, sessionId);
		return { ok: true, ...config };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Credential unavailable";
		return { ok: false, error: message };
	}
}
