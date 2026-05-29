import { randomUUID } from "node:crypto";
import type { Context } from "hono";

import { getAuthSession } from "./auth";
import { storeSessionCredential } from "./credentials";
import { encryptSecret } from "./crypto";
import { getDb } from "./db";
import { auditLogs, servers } from "./db/schema";
import { getServerDetailSnapshot } from "./server-detail-snapshot";
import { getClientIp } from "./lib/get-client-ip";
import {
	buildOsInfo,
	getOwnedServerRecord,
	normalizeAuthMethod,
	resolveServerCredential,
} from "./server-records";
import {
	type SshAuthMethod,
	SshConnectError,
	type VerifiedServerInfo,
	verifyServerConnection,
} from "./ssh";

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
	let verified: VerifiedServerInfo;

	try {
		verified = await verifyServerConnection({
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

		await db.insert(auditLogs).values({
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

		await db.insert(auditLogs).values({
			userId: session.user.id,
			action: "server.connect.succeeded",
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

		return context.json({
			server: serverRecord,
			verification: {
				host: parsed.host,
				osName: verified.osName,
				osVersion: verified.osVersion,
				architecture: verified.architecture,
				supportLevel: verified.supportLevel,
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

	if (connectionChanged) {
		const authMethod = normalizeAuthMethod(currentServer.authMethod);
		if (!authMethod) {
			return context.json({ error: "Unsupported authentication method" }, 400);
		}

		let credential: string;
		try {
			credential = resolveServerCredential(currentServer, session.session.id);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Temporary credential expired. Reconnect the server first.";
			return context.json({ error: message }, 400);
		}

		try {
			const verified = await verifyServerConnection({
				host: parsed.host,
				port: parsed.port,
				username: parsed.username,
				authMethod,
				credential,
			});
			nextOsInfo = buildOsInfo(verified);
			nextStatus = "connected";
		} catch (error) {
			const message =
				error instanceof SshConnectError
					? error.message
					: "SSH verification failed";

			await db.insert(auditLogs).values({
				userId: session.user.id,
				action: "server.update.failed",
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
		})
		.where(eq(servers.id, serverId));

	await db.insert(auditLogs).values({
		userId: session.user.id,
		action: "server.update.succeeded",
		details: {
			serverId,
			host: parsed.host,
			connectionChanged,
		},
		ipAddress,
	});

	return readServerDetailResponse(context, serverId, session.user.id);
}

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
		.where(eq(servers.id, input.serverId))
		.limit(1);

	return serverRecord ?? null;
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
	return sessionId && sessionId.length > 0 ? sessionId : randomUUID();
}
