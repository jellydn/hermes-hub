import { and, desc, eq, inArray } from "drizzle-orm";

import type {
	ServerActionHistoryItem,
	ServerActionResult,
	ServerActionType,
	ServerDetailSnapshot,
} from "../src/lib/server-detail";
import { getDb } from "./db";
import { auditLogs, installs } from "./db/schema";
import { getOwnedServerRecord, type OwnedServerRecord } from "./server-records";

type AuditRecord = {
	id: string;
	action: string;
	details: unknown;
	createdAt: Date;
};

const finishedActionNames = new Set([
	"server.action.restart.succeeded",
	"server.action.restart.failed",
	"server.action.update.succeeded",
	"server.action.update.failed",
	"server.action.rollback.succeeded",
	"server.action.rollback.failed",
]);

export async function getServerDetailSnapshot(input: {
	serverId: string;
	userId: string;
}): Promise<ServerDetailSnapshot | null> {
	const serverRecord = await getOwnedServerRecord(input);
	if (!serverRecord) {
		return null;
	}

	const [installRecord, actionHistory] = await Promise.all([
		getLatestInstallRecord(input.serverId),
		getServerActionHistory(input.serverId),
	]);
	const rollbackTarget = getRollbackTargetFromHistory(actionHistory);

	return {
		server: buildServerSnapshot(serverRecord),
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

export function getRollbackTargetFromHistory(
	history: ServerActionHistoryItem[],
) {
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

function buildServerSnapshot(serverRecord: OwnedServerRecord) {
	return {
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
		supportLevel: readOsInfoValue(serverRecord.osInfo, "supportLevel") as
			| "supported"
			| "untested"
			| null,
	};
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
			and(
				inArray(auditLogs.action, [...finishedActionNames]),
				eq(auditLogs.serverId, serverId),
			),
		)
		.orderBy(desc(auditLogs.createdAt))
		.limit(5);

	return records.map((record) => toActionHistoryItem(record as AuditRecord));
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

function formatActionLabel(action: ServerActionType) {
	if (action === "restart") {
		return "Restart agent";
	}

	if (action === "update") {
		return "Update Hermes";
	}

	return "Rollback";
}

function readOsInfoValue(osInfo: Record<string, unknown>, key: string) {
	const value = osInfo[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function readStringValue(details: Record<string, unknown>, key: string) {
	const value = details[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
