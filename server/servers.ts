import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Context } from "hono";

import type { ServerListSummary } from "../src/lib/servers";
import { getAuthSession } from "./auth";
import { storeSessionCredential } from "./credentials";
import { encryptSecret } from "./crypto";
import { getDb } from "./db";
import { auditLogs, installs, servers } from "./db/schema";
import { getClientIp } from "./lib/get-client-ip";
import { getServerDetailSnapshot } from "./server-detail-snapshot";
import {
	buildOsInfo,
	getOwnedServerRecord,
	normalizeAuthMethod,
	readOsInfoValue,
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

type ServerListRecord = {
	id: string;
	label: string;
	host: string;
	status: string;
	osInfo: Record<string, unknown>;
	updatedAt: Date;
};

type InstallListRecord = {
	serverId: string;
	status: string;
	updatedAt: Date;
};

type ServerActionRecord = {
	action: string;
	details: unknown;
	createdAt: Date;
};

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

export async function listServers(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const servers = await getServerListSnapshot(session.user.id);
	return context.json({ servers });
}

export async function getServerListSnapshot(
	userId: string,
): Promise<ServerListSummary[]> {
	const serverRecords = await getOwnedServerListRecords(userId);
	if (serverRecords.length === 0) {
		return [];
	}

	const serverIds = serverRecords.map((serverRecord) => serverRecord.id);
	const [installRecords, actionRecords] = await Promise.all([
		getLatestInstallRecords(serverIds),
		getLatestServerActionRecords(userId),
	]);
	const installsByServerId = collectLatestInstalls(installRecords);
	const actionsByServerId = collectLatestActions(
		actionRecords,
		new Set(serverIds),
	);

	return serverRecords.map((serverRecord) => {
		const installRecord = installsByServerId.get(serverRecord.id) ?? null;
		const actionRecord = actionsByServerId.get(serverRecord.id) ?? null;
		const lastActivityAt =
			latestTimestampIso([
				serverRecord.updatedAt,
				installRecord?.updatedAt,
				actionRecord?.createdAt,
			]) ?? serverRecord.updatedAt.toISOString();

		return {
			id: serverRecord.id,
			label: serverRecord.label,
			host: serverRecord.host,
			status: serverRecord.status,
			osName: readOsInfoValue(serverRecord.osInfo, "name"),
			osVersion: readOsInfoValue(serverRecord.osInfo, "version"),
			supportLevel: readOsInfoValue(serverRecord.osInfo, "supportLevel") as
				| "supported"
				| "untested"
				| null,
			installStatus: installRecord?.status ?? null,
			installUpdatedAt: installRecord?.updatedAt.toISOString() ?? null,
			lastActionAt: actionRecord?.createdAt.toISOString() ?? null,
			lastActivityAt,
		};
	});
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
		.where(and(eq(servers.id, serverId), eq(servers.userId, session.user.id)));

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
		.where(
			and(eq(servers.id, input.serverId), eq(servers.userId, input.userId)),
		)
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

async function getOwnedServerListRecords(userId: string) {
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

async function getLatestInstallRecords(serverIds: string[]) {
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

async function getLatestServerActionRecords(userId: string) {
	const records = await getDb()
		.select({
			action: auditLogs.action,
			details: auditLogs.details,
			createdAt: auditLogs.createdAt,
		})
		.from(auditLogs)
		.where(
			and(
				eq(auditLogs.userId, userId),
				inArray(auditLogs.action, [...relevantServerActionNames]),
			),
		)
		.orderBy(desc(auditLogs.createdAt));

	return records as ServerActionRecord[];
}

function collectLatestInstalls(records: InstallListRecord[]) {
	const installsByServerId = new Map<string, InstallListRecord>();

	for (const record of records) {
		if (!installsByServerId.has(record.serverId)) {
			installsByServerId.set(record.serverId, record);
		}
	}

	return installsByServerId;
}

function collectLatestActions(
	records: ServerActionRecord[],
	serverIds: Set<string>,
) {
	const actionsByServerId = new Map<string, ServerActionRecord>();

	for (const record of records) {
		const serverId = readServerId(record.details);
		if (
			!serverId ||
			!serverIds.has(serverId) ||
			actionsByServerId.has(serverId)
		) {
			continue;
		}

		actionsByServerId.set(serverId, record);
	}

	return actionsByServerId;
}

function latestTimestampIso(values: Array<Date | null | undefined>) {
	const timestamps = values
		.filter((value): value is Date => value instanceof Date)
		.map((value) => value.getTime());

	if (timestamps.length === 0) {
		return null;
	}

	return new Date(Math.max(...timestamps)).toISOString();
}

function readServerId(details: unknown) {
	if (!isRecord(details)) {
		return null;
	}

	const value = details.serverId;
	return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getSessionKey(sessionId?: string | null) {
	return sessionId && sessionId.length > 0 ? sessionId : randomUUID();
}
