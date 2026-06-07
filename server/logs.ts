import { and, desc, eq, inArray } from "drizzle-orm";
import type { Context } from "hono";

import type {
	ActionLogEntry,
	InstallLogEntry,
	LogsSnapshot,
} from "../src/lib/logs";
import { LOG_ACTION_NAMES } from "./audit-log-actions";
import { getAuthSession } from "./auth";
import { getDb } from "./db";
import { auditLogs, installEvents, installs, servers } from "./db/schema";
import { buildLogLinesFromEvents } from "./install/log-lines";
import { formatActionLabel } from "./lib/action-labels";

const finishedActionNames = LOG_ACTION_NAMES;

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

	await db.transaction(async (tx) => {
		await tx
			.delete(auditLogs)
			.where(
				and(
					eq(auditLogs.userId, userId),
					inArray(auditLogs.action, [...finishedActionNames]),
				),
			);
		await tx
			.delete(installEvents)
			.where(inArray(installEvents.installId, userInstallIds));
	});

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

	const eventRowsByInstall = await Promise.all(
		installIds.map(async (installId) => {
			const rows = await db
				.select({
					installId: installEvents.installId,
					stepName: installEvents.step,
					message: installEvents.message,
					createdAt: installEvents.createdAt,
				})
				.from(installEvents)
				.where(eq(installEvents.installId, installId))
				.orderBy(installEvents.createdAt)
				.limit(INSTALL_LOG_EVENT_LIMIT_PER_INSTALL);

			return rows;
		}),
	);

	const eventsByInstall = new Map(
		installIds.map((installId, index) => [
			installId,
			eventRowsByInstall[index] ?? [],
		]),
	);

	return recentInstallRows
		.map((install) => {
			const events = eventsByInstall.get(install.id) ?? [];
			const logLines = buildLogLinesFromEvents(
				events.map((e) => ({
					step: e.stepName,
					message: e.message,
					createdAt: e.createdAt,
				})),
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
	const failed = record.action.endsWith(".failed");
	const serverLabel = record.serverId
		? (serverLabels.get(record.serverId) ?? "Unknown server")
		: "Unknown server";

	return {
		id: record.id,
		serverLabel,
		action,
		result: failed ? "failed" : "succeeded",
		createdAt: record.createdAt.toISOString(),
		message: buildActionMessage(action, failed, serverLabel, details),
	};
}

function buildActionMessage(
	action: ActionLogEntry["action"],
	failed: boolean,
	serverLabel: string,
	details: Record<string, unknown>,
): string {
	if (failed) {
		const storedError =
			(typeof details.error === "string" && details.error) ||
			(typeof details.message === "string" && details.message);
		if (storedError) {
			return storedError;
		}
	} else if (typeof details.message === "string") {
		return details.message;
	}

	if (action === "mcp" || action === "agent_skills" || action === "persona") {
		return buildSettingsDeployMessage(action, failed, serverLabel, details);
	}

	return `${formatActionLabel(action)} ${failed ? "failed" : "succeeded"}.`;
}

function buildSettingsDeployMessage(
	action: "mcp" | "agent_skills" | "persona",
	failed: boolean,
	serverLabel: string,
	details: Record<string, unknown>,
): string {
	const verb = failed ? "Deploy failed" : "Deployed";
	const target = ` to ${serverLabel}`;

	if (action === "mcp") {
		const count = readCount(details.serverCount);
		const suffix =
			count !== null ? ` (${count} MCP server${count === 1 ? "" : "s"})` : "";
		return `MCP servers: ${verb}${target}${suffix}.`;
	}

	if (action === "agent_skills") {
		const count = readCount(details.skillCount);
		const suffix =
			count !== null
				? ` (${count} enabled skill${count === 1 ? "" : "s"})`
				: "";
		return `Agent skills: ${verb}${target}${suffix}.`;
	}

	return `Persona: ${verb}${target}.`;
}

function readCount(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readActionType(action: string): ActionLogEntry["action"] {
	if (action.startsWith("mcp.")) {
		return "mcp";
	}

	if (action.startsWith("agent_skills.")) {
		return "agent_skills";
	}

	if (action.startsWith("persona.")) {
		return "persona";
	}

	if (action.includes(".update.")) {
		return "update";
	}

	if (action.includes(".rollback.")) {
		return "rollback";
	}

	return "restart";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
