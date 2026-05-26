import { and, desc, eq, inArray } from "drizzle-orm";
import type { Context } from "hono";

import type {
	ServerActionHistoryItem,
	ServerActionResult,
	ServerActionType,
	ServerDetailSnapshot,
} from "../src/lib/server-detail";
import { getAuthSession } from "./auth";
import { getSessionCredential } from "./credentials";
import { decryptSecret } from "./crypto";
import { getDb } from "./db";
import { auditLogs, installs, servers } from "./db/schema";
import { getClientIp } from "./lib/get-client-ip";
import { type SshAuthMethod, SshConnectError, withSshConnection } from "./ssh";

const actionCommands: Record<
	ServerActionType,
	(targetVersion?: string) => string
> = {
	restart: () => "cd ~/hermes && sudo docker compose restart",
	update: () =>
		"cd ~/hermes && sudo docker compose pull && sudo docker compose up -d",
	rollback: (targetVersion) => {
		const imageTag = targetVersion?.trim() || "latest";
		return [
			"cd ~/hermes",
			`sudo docker pull ghcr.io/hermes-agent/hermes:${imageTag}`,
			`sudo sed -i.bak 's|image: ghcr.io/hermes-agent/hermes:.*|image: ghcr.io/hermes-agent/hermes:${imageTag}|' docker-compose.yml`,
			"sudo docker compose up -d",
		].join(" && ");
	},
};

const startedActionNames = new Set([
	"server.action.restart.started",
	"server.action.update.started",
	"server.action.rollback.started",
]);

const finishedActionNames = new Set([
	"server.action.restart.succeeded",
	"server.action.restart.failed",
	"server.action.update.succeeded",
	"server.action.update.failed",
	"server.action.rollback.succeeded",
	"server.action.rollback.failed",
]);

type ServerCredentialRecord = {
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

type AuditRecord = {
	id: string;
	action: string;
	details: unknown;
	createdAt: Date;
};

type ServerActionRequest = {
	action?: ServerActionType;
	targetVersion?: string;
};

export async function runServerAction(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	let payload: ServerActionRequest;
	try {
		payload = await context.req.json<ServerActionRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const action = payload.action;
	if (!action || !(action in actionCommands)) {
		return context.json(
			{ error: "Action must be restart, update, or rollback" },
			400,
		);
	}

	const db = getDb();
	const serverRecord = await getServerRecord({
		serverId,
		userId: session.user.id,
	});

	if (!serverRecord) {
		return context.json({ error: "Server not found" }, 404);
	}

	const authMethod = normalizeAuthMethod(serverRecord.authMethod);
	if (!authMethod) {
		return context.json({ error: "Unsupported authentication method" }, 400);
	}

	let credential: string;
	try {
		credential = resolveServerCredential(serverRecord, session.session.id);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Temporary credential expired. Reconnect the server first.";
		return context.json({ error: message }, 400);
	}

	const versionTarget =
		action === "rollback"
			? payload.targetVersion?.trim() ||
				(await getRollbackTarget(serverId)) ||
				"latest"
			: null;
	const ipAddress = getClientIp(context);
	const startedActionName = `server.action.${action}.started`;

	await db.insert(auditLogs).values({
		userId: session.user.id,
		action: startedActionName,
		details: {
			serverId,
			host: serverRecord.host,
			...(versionTarget ? { imageRef: versionTarget } : {}),
		},
		ipAddress,
	});

	try {
		const command = actionCommands[action](versionTarget ?? undefined);
		const commandOutput = await executeServerAction({
			server: serverRecord,
			authMethod,
			credential,
			command,
		});

		await db.insert(auditLogs).values({
			userId: session.user.id,
			action: `server.action.${action}.succeeded`,
			details: {
				serverId,
				host: serverRecord.host,
				message: actionSuccessMessage(action, versionTarget),
				output: commandOutput || null,
				...(versionTarget ? { imageRef: versionTarget } : {}),
			},
			ipAddress,
		});

		if (action === "update" || action === "rollback") {
			await updateLatestInstallVersion(serverId, versionTarget ?? "latest");
		}

		return context.json({
			status: "succeeded",
			action,
			message: actionSuccessMessage(action, versionTarget),
			...(versionTarget ? { imageRef: versionTarget } : {}),
		});
	} catch (error) {
		const message = normalizeServerActionError(error);

		await db.insert(auditLogs).values({
			userId: session.user.id,
			action: `server.action.${action}.failed`,
			details: {
				serverId,
				host: serverRecord.host,
				message,
				...(versionTarget ? { imageRef: versionTarget } : {}),
			},
			ipAddress,
		});

		return context.json({ error: `Action failed: ${message}` }, 400);
	}
}

export async function getServerDetail(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	const detail = await getServerDetailSnapshot({
		serverId,
		userId: session.user.id,
	});

	if (!detail) {
		return context.json({ error: "Server not found" }, 404);
	}

	return context.json({ serverDetail: detail });
}

export async function getServerDetailSnapshot(input: {
	serverId: string;
	userId: string;
}): Promise<ServerDetailSnapshot | null> {
	const serverRecord = await getServerRecord(input);
	if (!serverRecord) {
		return null;
	}

	const [installRecord, actionHistory] = await Promise.all([
		getLatestInstallRecord(input.serverId),
		getServerActionHistory(input.serverId),
	]);
	const rollbackTarget = getRollbackTargetFromHistory(actionHistory);

	return {
		server: {
			id: serverRecord.id,
			label: serverRecord.label,
			host: serverRecord.host,
			port: serverRecord.port,
			username: serverRecord.username,
			authMethod: serverRecord.authMethod,
			status: serverRecord.status,
			osName: readOsInfoValue(serverRecord.osInfo, "name"),
			osVersion: readOsInfoValue(serverRecord.osInfo, "version"),
			architecture: readOsInfoValue(serverRecord.osInfo, "architecture"),
		},
		install: installRecord
			? {
					status: installRecord.status,
					version: installRecord.version,
					updatedAt: installRecord.updatedAt.toISOString(),
				}
			: null,
		actionHistory,
		rollbackTarget,
	};
}

async function executeServerAction(input: {
	server: ServerCredentialRecord;
	authMethod: SshAuthMethod;
	credential: string;
	command: string;
}) {
	return withSshConnection(
		{
			host: input.server.host,
			port: input.server.port,
			username: input.server.username,
			authMethod: input.authMethod,
			credential: input.credential,
		},
		async (ssh) => {
			const result = await ssh.execCommand(input.command);
			if (result.code !== 0) {
				throw new Error(result.stderr || "Remote command failed");
			}

			return result.stdout.trim();
		},
	);
}

async function getServerRecord(input: { serverId: string; userId: string }) {
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

	return (serverRecord as ServerCredentialRecord | undefined) ?? null;
}

async function getLatestInstallRecord(serverId: string) {
	const [installRecord] = await getDb()
		.select({
			status: installs.status,
			version: installs.version,
			updatedAt: installs.updatedAt,
		})
		.from(installs)
		.where(eq(installs.serverId, serverId))
		.orderBy(desc(installs.createdAt))
		.limit(1);

	return installRecord ?? null;
}

async function getServerActionHistory(serverId: string) {
	const records = await getDb()
		.select({
			id: auditLogs.id,
			action: auditLogs.action,
			details: auditLogs.details,
			createdAt: auditLogs.createdAt,
		})
		.from(auditLogs)
		.where(
			inArray(auditLogs.action, [
				...startedActionNames,
				...finishedActionNames,
			]),
		)
		.orderBy(desc(auditLogs.createdAt))
		.limit(20);

	return records
		.filter((record) => readServerId(record.details) === serverId)
		.filter((record) => !startedActionNames.has(record.action))
		.slice(0, 5)
		.map((record) => toActionHistoryItem(record as AuditRecord));
}

function toActionHistoryItem(record: AuditRecord): ServerActionHistoryItem {
	const action = readActionType(record.action);
	const result = record.action.endsWith(".failed") ? "failed" : "succeeded";
	const details = isRecord(record.details) ? record.details : {};

	return {
		id: record.id,
		action,
		result,
		createdAt: record.createdAt.toISOString(),
		message: readActionMessage(details, action, result),
		imageRef: readStringValue(details, "imageRef"),
	};
}

function readActionType(actionName: string): ServerActionType {
	if (actionName.includes(".update.")) {
		return "update";
	}

	if (actionName.includes(".rollback.")) {
		return "rollback";
	}

	return "restart";
}

function readActionMessage(
	details: Record<string, unknown>,
	action: ServerActionType,
	result: ServerActionResult,
) {
	const explicitMessage = readStringValue(details, "message");
	if (explicitMessage) {
		return explicitMessage;
	}

	if (result === "failed") {
		return `Action failed: ${formatActionLabel(action)} failed.`;
	}

	return `${formatActionLabel(action)} completed.`;
}

function resolveServerCredential(
	serverRecord: Pick<
		ServerCredentialRecord,
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

function normalizeAuthMethod(authMethod: string): SshAuthMethod | null {
	if (authMethod === "password" || authMethod === "ssh-key") {
		return authMethod;
	}

	return null;
}

function normalizeServerActionError(error: unknown) {
	if (error instanceof SshConnectError) {
		return error.message;
	}

	return error instanceof Error ? error.message : "Remote action failed";
}

function formatActionLabel(action: ServerActionType) {
	if (action === "restart") {
		return "Restart agent";
	}

	if (action === "update") {
		return "Update Hermes";
	}

	return "Rollback";
}

function actionSuccessMessage(
	action: ServerActionType,
	versionTarget: string | null,
) {
	if (action === "restart") {
		return "Restarted Hermes successfully.";
	}

	if (action === "update") {
		return "Updated Hermes to the latest image successfully.";
	}

	return `Rolled Hermes back to ${versionTarget ?? "the previous image"}.`;
}

function readOsInfoValue(osInfo: Record<string, unknown>, key: string) {
	const value = osInfo[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function readServerId(details: unknown) {
	return readStringValue(isRecord(details) ? details : {}, "serverId");
}

function readStringValue(details: Record<string, unknown>, key: string) {
	const value = details[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getRollbackTargetFromHistory(history: ServerActionHistoryItem[]) {
	for (const item of history) {
		if (
			item.action === "rollback" &&
			item.result === "succeeded" &&
			item.imageRef
		) {
			return item.imageRef;
		}
	}

	return null;
}

async function getRollbackTarget(serverId: string) {
	const [latestInstall] = await getDb()
		.select({ version: installs.version })
		.from(installs)
		.where(eq(installs.serverId, serverId))
		.orderBy(desc(installs.createdAt))
		.limit(1);

	return latestInstall?.version ?? null;
}

async function updateLatestInstallVersion(serverId: string, version: string) {
	const [latestInstall] = await getDb()
		.select({ id: installs.id })
		.from(installs)
		.where(eq(installs.serverId, serverId))
		.orderBy(desc(installs.createdAt))
		.limit(1);

	if (!latestInstall) {
		return;
	}

	await getDb()
		.update(installs)
		.set({
			version,
			updatedAt: new Date(),
		})
		.where(eq(installs.id, latestInstall.id));
}
