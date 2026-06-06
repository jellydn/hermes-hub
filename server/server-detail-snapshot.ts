import { and, desc, eq, inArray } from "drizzle-orm";
import {
	formatActionLabel,
	type ServerActionHistoryItem,
	type ServerActionResult,
	type ServerActionType,
	type ServerDetailSnapshot,
} from "../src/lib/server-detail";
import { getDb } from "./db";
import { auditLogs } from "./db/schema";
import { getLatestInstallForServer } from "./install/records";
import { getNonEmptyString } from "./lib/non-empty-string";
import {
	getOwnedServerRecord,
	type OwnedServerRecord,
	readOsInfoValue,
} from "./server-records";
import { getServerWebUiRecord } from "./web-ui/records";
import { buildWebUiSnapshot } from "./web-ui/snapshot";

type AuditRecord = {
	id: string;
	action: string;
	details: unknown;
	createdAt: Date;
};

import { USER_INITIATED_ACTION_NAME_SET } from "./audit-log-actions";

const finishedActionNames = USER_INITIATED_ACTION_NAME_SET;

export async function getServerDetailSnapshot(input: {
	serverId: string;
	userId: string;
}): Promise<ServerDetailSnapshot | null> {
	const serverRecord = await getOwnedServerRecord(input);
	if (!serverRecord) {
		return null;
	}

	const [installRecord, actionHistory, webUiRecord] = await Promise.all([
		getLatestInstallForServer(input.serverId),
		getServerActionHistory(input.serverId),
		getServerWebUiRecord(input.serverId),
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
		webUi: webUiRecord ? buildWebUiSnapshot(input.serverId, webUiRecord) : null,
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
		imageRef: getNonEmptyString(details.imageRef),
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
	const explicitMessage = getNonEmptyString(details.message);
	if (explicitMessage) {
		return explicitMessage;
	}

	if (result === "failed") {
		return `Action failed: ${formatActionLabel(action)} failed.`;
	}

	return `${formatActionLabel(action)} completed.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
