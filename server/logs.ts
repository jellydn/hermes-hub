import { and, desc, eq, inArray } from "drizzle-orm";
import type { Context } from "hono";

import type {
	ActionLogEntry,
	InstallLogEntry,
	LogsSnapshot,
} from "../src/lib/logs";
import { getAuthSession } from "./auth";
import { getDb } from "./db";
import { auditLogs, installs, servers } from "./db/schema";

const finishedActionNames = [
	"server.action.restart.succeeded",
	"server.action.restart.failed",
	"server.action.update.succeeded",
	"server.action.update.failed",
	"server.action.rollback.succeeded",
	"server.action.rollback.failed",
] as const;

type InstallLogRecord = {
	id: string;
	log: string | null;
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
	const serverRecords = await getServerLabels(session.user.id);
	const serverIds = serverRecords.map((server) => server.id);

	if (serverIds.length > 0) {
		await db
			.update(installs)
			.set({ log: null })
			.where(inArray(installs.serverId, serverIds));
	}

	await db
		.delete(auditLogs)
		.where(
			and(
				eq(auditLogs.userId, session.user.id),
				inArray(auditLogs.action, [...finishedActionNames]),
			),
		);

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

async function getInstallLogs(userId: string) {
	const records = await getDb()
		.select({
			id: installs.id,
			log: installs.log,
			status: installs.status,
			step: installs.step,
			createdAt: installs.createdAt,
			updatedAt: installs.updatedAt,
			serverLabel: servers.label,
		})
		.from(installs)
		.innerJoin(servers, eq(installs.serverId, servers.id))
		.where(eq(servers.userId, userId))
		.orderBy(desc(installs.updatedAt))
		.limit(10);

	return records.filter(
		(record) => typeof record.log === "string" && record.log.trim().length > 0,
	) as InstallLogRecord[];
}

async function getActionLogs(userId: string) {
	const records = await getDb()
		.select({
			id: auditLogs.id,
			action: auditLogs.action,
			details: auditLogs.details,
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
		lines: splitLogLines(record.log),
	};
}

function toActionLogEntry(
	record: ActionLogRecord,
	serverLabels: Map<string, string>,
): ActionLogEntry {
	const details = isRecord(record.details) ? record.details : {};
	const serverId = typeof details.serverId === "string" ? details.serverId : "";
	const action = readActionType(record.action);

	return {
		id: record.id,
		serverLabel: serverLabels.get(serverId) ?? "Unknown server",
		action,
		result: record.action.endsWith(".failed") ? "failed" : "succeeded",
		createdAt: record.createdAt.toISOString(),
		message:
			typeof details.message === "string"
				? details.message
				: `${formatActionLabel(action)} ${record.action.endsWith(".failed") ? "failed" : "succeeded"}.`,
	};
}

function splitLogLines(log: string | null) {
	if (!log) {
		return [];
	}

	return log
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
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
