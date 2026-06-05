import { and, desc, eq, inArray } from "drizzle-orm";
import type { Context } from "hono";

import type {
	ActionLogEntry,
	InstallLogEntry,
	LogsSnapshot,
} from "../src/lib/logs";
import { USER_INITIATED_ACTION_NAMES } from "./audit-log-actions";
import { getAuthSession } from "./auth";
import { getDb } from "./db";
import { auditLogs, installEvents, installs, servers } from "./db/schema";
import { buildLogLinesFromEvents } from "./install/legacy-log";

const finishedActionNames = USER_INITIATED_ACTION_NAMES;

type InstallLogRecord = {
	id: string;
	lines: string[];
	status: string;
	step: string;
	createdAt: Date;
	updatedAt: Date;
	serverLabel: string;
};

type ActionLogRecord = {
	id: string;
	action: string;
	details: unknown;
	serverId: string | null;
	createdAt: Date;
};

type ServerLabelRecord = {
	id: string;
	label: string;
};

export async function getLogs(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const logs = await getLogsSnapshot(session.user.id);
	return context.json({ logs });
}

export async function clearLogs(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const db = getDb();
	const userId = session.user.id;

	const userInstallIds = db
		.select({ id: installs.id })
		.from(installs)
		.innerJoin(servers, eq(installs.serverId, servers.id))
		.where(eq(servers.userId, userId));

	await Promise.all([
		db
			.delete(auditLogs)
			.where(
				and(
					eq(auditLogs.userId, userId),
					inArray(auditLogs.action, [...finishedActionNames]),
				),
			),
		db
			.delete(installEvents)
			.where(inArray(installEvents.installId, userInstallIds)),
	]);

	return context.json({ status: "cleared" });
}

export async function getLogsSnapshot(userId: string): Promise<LogsSnapshot> {
	const [installRecords, actionRecords, serverRecords] = await Promise.all([
		getInstallLogs(userId),
		getActionLogs(userId),
		getServerLabels(userId),
	]);

	const serverLabels = new Map(
		serverRecords.map((server) => [server.id, server.label]),
	);

	return {
		installLogs: installRecords.map(toInstallLogEntry),
		actionLogs: actionRecords.map((record) =>
			toActionLogEntry(record, serverLabels),
		),
	};
}

const INSTALL_LOG_INSTALL_LIMIT = 50;
const INSTALL_LOG_EVENT_LIMIT_PER_INSTALL = 200;

async function getInstallLogs(userId: string) {
	const db = getDb();

	const recentInstallRows = await db
		.select({
			id: installs.id,
			status: installs.status,
			step: installs.step,
			createdAt: installs.createdAt,
			updatedAt: installs.updatedAt,
			legacyLog: installs.log,
			serverLabel: servers.label,
		})
		.from(installs)
		.innerJoin(servers, eq(installs.serverId, servers.id))
		.where(eq(servers.userId, userId))
		.orderBy(desc(installs.updatedAt))
		.limit(INSTALL_LOG_INSTALL_LIMIT);

	if (recentInstallRows.length === 0) {
		return [];
	}

	const installIds = recentInstallRows.map((row) => row.id);

	const eventRows = await db
		.select({
			installId: installEvents.installId,
			stepName: installEvents.step,
			message: installEvents.message,
			createdAt: installEvents.createdAt,
		})
		.from(installEvents)
		.where(inArray(installEvents.installId, installIds))
		.orderBy(installEvents.createdAt)
		.limit(INSTALL_LOG_EVENT_LIMIT_PER_INSTALL * installIds.length);

	const eventsByInstall = new Map<string, typeof eventRows>();
	for (const event of eventRows) {
		const bucket = eventsByInstall.get(event.installId) ?? [];
		if (bucket.length < INSTALL_LOG_EVENT_LIMIT_PER_INSTALL) {
			bucket.push(event);
		}
		eventsByInstall.set(event.installId, bucket);
	}

	return recentInstallRows
		.map((install) => {
			const events = eventsByInstall.get(install.id) ?? [];
			const logLines = buildLogLinesFromEvents(
				events.map((e) => ({
					step: e.stepName,
					message: e.message,
					createdAt: e.createdAt,
				})),
				install.legacyLog,
				install.createdAt,
			);

			if (logLines.length === 0) {
				return null;
			}

			return {
				id: install.id,
				serverLabel: install.serverLabel,
				status: install.status,
				step: install.step,
				createdAt: install.createdAt,
				updatedAt: install.updatedAt,
				lines: logLines,
			};
		})
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

async function getActionLogs(userId: string) {
	const records = await getDb()
		.select({
			id: auditLogs.id,
			action: auditLogs.action,
			details: auditLogs.details,
			serverId: auditLogs.serverId,
			createdAt: auditLogs.createdAt,
		})
		.from(auditLogs)
		.where(
			and(
				eq(auditLogs.userId, userId),
				inArray(auditLogs.action, [...finishedActionNames]),
			),
		)
		.orderBy(desc(auditLogs.createdAt))
		.limit(20);

	return records as ActionLogRecord[];
}

async function getServerLabels(userId: string) {
	const records = await getDb()
		.select({
			id: servers.id,
			label: servers.label,
		})
		.from(servers)
		.where(eq(servers.userId, userId));

	return records as ServerLabelRecord[];
}

function toInstallLogEntry(record: InstallLogRecord): InstallLogEntry {
	return {
		id: record.id,
		serverLabel: record.serverLabel,
		status: record.status,
		step: record.step,
		createdAt: record.createdAt.toISOString(),
		updatedAt: record.updatedAt.toISOString(),
		lines: record.lines,
	};
}

function toActionLogEntry(
	record: ActionLogRecord,
	serverLabels: Map<string, string>,
): ActionLogEntry {
	const details = isRecord(record.details) ? record.details : {};
	const action = readActionType(record.action);
	const serverLabel = record.serverId
		? (serverLabels.get(record.serverId) ?? "Unknown server")
		: "Unknown server";

	return {
		id: record.id,
		serverLabel,
		action,
		result: record.action.endsWith(".failed") ? "failed" : "succeeded",
		createdAt: record.createdAt.toISOString(),
		message:
			typeof details.message === "string"
				? details.message
				: `${formatActionLabel(action)} ${record.action.endsWith(".failed") ? "failed" : "succeeded"}.`,
	};
}

function readActionType(action: string): ActionLogEntry["action"] {
	if (action.includes(".update.")) {
		return "update";
	}

	if (action.includes(".rollback.")) {
		return "rollback";
	}

	return "restart";
}

function formatActionLabel(action: ActionLogEntry["action"]) {
	if (action === "update") {
		return "Update Hermes";
	}

	if (action === "rollback") {
		return "Rollback";
	}

	return "Restart Agent";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
