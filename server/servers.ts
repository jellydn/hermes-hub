import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { getAuthSession } from "./auth";
import { storeSessionCredential } from "./credentials";
import { encryptSecret } from "./crypto";
import { getDb } from "./db";
import { auditLogs, servers } from "./db/schema";
import { getClientIp } from "./lib/get-client-ip";
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
				osInfo: {
					name: verified.osName,
					version: verified.osVersion,
					architecture: verified.architecture,
					supportLevel: verified.supportLevel,
					raw: verified.raw,
				},
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

function getSessionKey(sessionId?: string | null) {
	return sessionId && sessionId.length > 0 ? sessionId : randomUUID();
}
