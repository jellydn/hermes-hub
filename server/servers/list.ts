import type { ServerListSummary } from "../../src/lib/servers";
import { readOsInfoValue } from "../server-records";
import {
	getLatestInstallRecords,
	getLatestServerActionRecords,
	getOwnedServerListRecords,
	type InstallListRecord,
	type ServerActionRecord,
} from "./records";

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
		getLatestServerActionRecords(userId, serverIds),
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
