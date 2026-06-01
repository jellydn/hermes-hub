import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";

import { getAuthSession } from "./auth";
import { storeSessionCredential } from "./credentials";
import { encryptSecret } from "./crypto";
import { clearDashboardCache } from "./dashboard";
import { getDb } from "./db";
import { servers } from "./db/schema";
import { getClientIp } from "./lib/get-client-ip";
import { insertAuditLog } from "./lib/insert-audit-log";
import { getServerDetailSnapshot } from "./server-detail-snapshot";
import {
	buildOsInfo,
	getOwnedServerRecord,
	resolveServerSshConfig,
} from "./server-records";
import { getServerListSnapshot as getServerListSnapshotImpl } from "./servers/list";
import {
	type SshAuthMethod,
	SshConnectError,
	verifyServerConnection,
} from "./ssh";
import { isValidSha256HostKeyFingerprint } from "./ssh/host-key-fingerprint";

// Re-export for server-fn usage in src/routes/servers.index.tsx
export { getServerListSnapshotImpl as getServerListSnapshot };

type ConnectServerRequest = {
	label: string;
	host: string;
	port: number;
	username: string;
	authMethod: SshAuthMethod;
	password?: string;
	privateKey?: string;
	storeCredential: boolean;
};

type UpdateServerRequest = {
	label?: string;
	host?: string;
	port?: number;
	username?: string;
};

export async function listServers(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const servers = await getServerListSnapshotImpl(session.user.id);
	return context.json({ servers });
}

export async function connectServer(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: ConnectServerRequest;
	try {
		payload = await context.req.json<ConnectServerRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const parsed = parseConnectRequest(payload);
	if ("error" in parsed) {
		return context.json({ error: parsed.error }, 400);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);
	let connectionResult: Awaited<ReturnType<typeof verifyServerConnection>>;

	try {
		connectionResult = await verifyServerConnection({
			host: parsed.host,
			port: parsed.port,
			username: parsed.username,
			authMethod: parsed.authMethod,
			credential: parsed.credential,
		});
	} catch (error) {
		const message =
			error instanceof SshConnectError
				? error.message
				: "SSH verification failed";

		await insertAuditLog(db, {
			userId: session.user.id,
			action: "server.connect.failed",
			details: {
				host: parsed.host,
				reason: message,
			},
			ipAddress,
		});

		return context.json({ error: message }, 400);
	}

	const { verified, hostKey } = connectionResult;

	try {
		const [serverRecord] = await db
			.insert(servers)
			.values({
				userId: session.user.id,
				label: parsed.label,
				host: parsed.host,
				port: parsed.port,
				username: parsed.username,
				authMethod: parsed.authMethod,
				encryptedCredential: parsed.storeCredential
					? encryptSecret(parsed.credential)
					: null,
				storeCredential: parsed.storeCredential,
				status: "connected",
				osInfo: buildOsInfo(verified),
				hostKeyFingerprint: hostKey.fingerprint,
				hostKeyAlgorithm: hostKey.algorithm,
			})
			.returning({
				id: servers.id,
				label: servers.label,
				host: servers.host,
				port: servers.port,
				username: servers.username,
				status: servers.status,
				osInfo: servers.osInfo,
			});

		const sessionId = getSessionKey(session.session.id);
		if (!parsed.storeCredential) {
			storeSessionCredential({
				serverId: serverRecord.id,
				sessionId,
				authMethod: parsed.authMethod,
				credential: parsed.credential,
			});
		}

		await insertAuditLog(db, {
			userId: session.user.id,
			action: "server.connect.succeeded",
			serverId: serverRecord.id,
			details: {
				serverId: serverRecord.id,
				host: parsed.host,
				osName: verified.osName,
				osVersion: verified.osVersion,
				architecture: verified.architecture,
				supportLevel: verified.supportLevel,
			},
			ipAddress,
		});

		clearDashboardCache();

		return context.json({
			server: serverRecord,
			verification: {
				host: parsed.host,
				osName: verified.osName,
				osVersion: verified.osVersion,
				architecture: verified.architecture,
				supportLevel: verified.supportLevel,
			},
			hostKey: {
				fingerprint: hostKey.fingerprint,
				algorithm: hostKey.algorithm,
			},
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to save server connection";

		return context.json({ error: message }, 500);
	}
}

export async function updateServer(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	let payload: UpdateServerRequest;
	try {
		payload = await context.req.json<UpdateServerRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const currentServer = await getOwnedServerRecord({
		serverId,
		userId: session.user.id,
	});
	if (!currentServer) {
		return context.json({ error: "Server not found" }, 404);
	}

	const parsed = parseUpdateRequest(payload, currentServer);
	if ("error" in parsed) {
		return context.json({ error: parsed.error }, 400);
	}

	const connectionChanged =
		parsed.host !== currentServer.host ||
		parsed.port !== currentServer.port ||
		parsed.username !== currentServer.username;
	const labelChanged = parsed.label !== currentServer.label;

	if (!connectionChanged && !labelChanged) {
		return readServerDetailResponse(context, serverId, session.user.id);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);
	let nextOsInfo = currentServer.osInfo;
	let nextStatus = currentServer.status;
	let nextHostKeyFingerprint: string | null = null;
	let nextHostKeyAlgorithm: string | null = null;

	if (connectionChanged) {
		let authMethod: SshAuthMethod;
		let credential: string;
		try {
			({ authMethod, credential } = resolveServerSshConfig(
				currentServer,
				session.session.id,
			));
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Temporary credential expired. Reconnect the server first.";
			return context.json({ error: message }, 400);
		}

		try {
			const connectionResult = await verifyServerConnection({
				host: parsed.host,
				port: parsed.port,
				username: parsed.username,
				authMethod,
				credential,
				expectedFingerprint: currentServer.hostKeyFingerprint ?? undefined,
			});
			nextOsInfo = buildOsInfo(connectionResult.verified);
			nextStatus = "connected";
			nextHostKeyFingerprint = connectionResult.hostKey.fingerprint;
			nextHostKeyAlgorithm = connectionResult.hostKey.algorithm;
		} catch (error) {
			if (
				error instanceof SshConnectError &&
				error.code === "host_key_mismatch"
			) {
				await insertAuditLog(db, {
					userId: session.user.id,
					action: "server.host_key.mismatch",
					serverId,
					details: {
						serverId,
						host: parsed.host,
						expectedFingerprint: currentServer.hostKeyFingerprint,
					},
					ipAddress,
				});

				return context.json(
					{
						error: "host key mismatch",
						code: "host_key_mismatch",
						hostKey: {
							expectedFingerprint: currentServer.hostKeyFingerprint,
							algorithm: currentServer.hostKeyAlgorithm,
							...(error.hostKey
								? {
										observedFingerprint: error.hostKey.fingerprint,
										observedAlgorithm: error.hostKey.algorithm,
									}
								: {}),
						},
					},
					409,
				);
			}

			const message =
				error instanceof SshConnectError
					? error.message
					: "SSH verification failed";

			await insertAuditLog(db, {
				userId: session.user.id,
				action: "server.update.failed",
				serverId,
				details: {
					serverId,
					host: parsed.host,
					reason: message,
				},
				ipAddress,
			});

			return context.json({ error: message }, 400);
		}
	}

	await db
		.update(servers)
		.set({
			label: parsed.label,
			host: parsed.host,
			port: parsed.port,
			username: parsed.username,
			status: nextStatus,
			osInfo: nextOsInfo,
			...(nextHostKeyFingerprint
				? {
						hostKeyFingerprint: nextHostKeyFingerprint,
						hostKeyAlgorithm: nextHostKeyAlgorithm,
					}
				: {}),
		})
		.where(and(eq(servers.id, serverId), eq(servers.userId, session.user.id)));

	await insertAuditLog(db, {
		userId: session.user.id,
		action: "server.update.succeeded",
		serverId,
		details: {
			serverId,
			host: parsed.host,
			connectionChanged,
		},
		ipAddress,
	});

	clearDashboardCache();

	return readServerDetailResponse(context, serverId, session.user.id);
}

export async function deleteServer(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	try {
		const [deleted] = await db
			.delete(servers)
			.where(and(eq(servers.id, serverId), eq(servers.userId, session.user.id)))
			.returning({ id: servers.id, label: servers.label, host: servers.host });

		if (!deleted) {
			return context.json({ error: "Server not found" }, 404);
		}

		await insertAuditLog(db, {
			userId: session.user.id,
			action: "server.action.delete.succeeded",
			serverId: deleted.id,
			details: {
				serverId: deleted.id,
				label: deleted.label,
				host: deleted.host,
			},
			ipAddress,
		});

		clearDashboardCache();

		return context.json({ ok: true });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to delete server";
		return context.json({ error: message }, 500);
	}
}

type AcceptHostKeyRequest = {
	fingerprint: string;
	algorithm?: string;
};

export async function acceptHostKey(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	let payload: AcceptHostKeyRequest;
	try {
		payload = await context.req.json<AcceptHostKeyRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const fingerprint = payload.fingerprint?.trim();
	if (!fingerprint || !isValidSha256HostKeyFingerprint(fingerprint)) {
		return context.json(
			{
				error:
					"Fingerprint must be a SHA256-prefixed OpenSSH fingerprint (SHA256: followed by 43 base64 characters).",
			},
			400,
		);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	const [serverRecord] = await db
		.update(servers)
		.set({
			hostKeyFingerprint: fingerprint,
			hostKeyAlgorithm: payload.algorithm ?? null,
		})
		.where(and(eq(servers.id, serverId), eq(servers.userId, session.user.id)))
		.returning({ id: servers.id, host: servers.host });

	if (!serverRecord) {
		return context.json({ error: "Server not found" }, 404);
	}

	await insertAuditLog(db, {
		userId: session.user.id,
		action: "server.host_key.rotated",
		serverId: serverRecord.id,
		details: {
			serverId: serverRecord.id,
			host: serverRecord.host,
			fingerprint,
		},
		ipAddress,
	});

	clearDashboardCache();

	return context.json({ ok: true, fingerprint });
}

function parseConnectRequest(payload: ConnectServerRequest) {
	const label = payload.label?.trim();
	const host = payload.host?.trim();
	const username = payload.username?.trim();
	const port = Number(payload.port);
	const authMethod = payload.authMethod;
	const credential =
		authMethod === "password"
			? payload.password?.trim()
			: payload.privateKey?.trim();

	if (!label || !host || !username) {
		return { error: "Label, host, and username are required" };
	}

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		return { error: "Port must be between 1 and 65535" };
	}

	if (authMethod !== "password" && authMethod !== "ssh-key") {
		return { error: "Authentication method must be password or ssh-key" };
	}

	if (!credential) {
		return {
			error:
				authMethod === "password"
					? "Password is required"
					: "Private key is required",
		};
	}

	return {
		label,
		host,
		port,
		username,
		authMethod,
		credential,
		storeCredential: payload.storeCredential,
	};
}

function parseUpdateRequest(
	payload: UpdateServerRequest,
	currentServer: {
		label: string;
		host: string;
		port: number;
		username: string;
	},
) {
	const label = (payload.label ?? currentServer.label)?.trim();
	const host = (payload.host ?? currentServer.host)?.trim();
	const username = (payload.username ?? currentServer.username)?.trim();
	const port = Number(payload.port ?? currentServer.port);

	if (!label || !host || !username) {
		return { error: "Label, host, and username are required" };
	}

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		return { error: "Port must be between 1 and 65535" };
	}

	return {
		label,
		host,
		port,
		username,
	};
}

async function readServerDetailResponse(
	context: Context,
	serverId: string,
	userId: string,
) {
	const detail = await getServerDetailSnapshot({ serverId, userId });
	if (!detail) {
		return context.json({ error: "Server not found" }, 404);
	}

	return context.json({ serverDetail: detail });
}

function getSessionKey(sessionId?: string | null) {
	return sessionId?.length ? sessionId : randomUUID();
}
