import { and, eq, isNull } from "drizzle-orm";

import type {
	ServerWebUiDeployStatus,
	ServerWebUiSnapshot,
} from "#shared/contracts/server-web-ui";
import { defaultHermesWebUiPort } from "../constants";
import { decryptSecret } from "../crypto";
import { getDb } from "../db";
import { serverWebUi } from "../db/schema";

type DbClient = Pick<ReturnType<typeof getDb>, "insert">;

export type ServerWebUiRecord = {
	enabled: boolean;
	encryptedPassword: string | null;
	port: number;
	deployStatus: string;
	deployError: string | null;
	deployStartedAt: Date | null;
	updatedAt: Date;
};

export type ServerWebUiUpsertPatch = {
	serverId: string;
	enabled?: boolean;
	encryptedPassword?: string | null;
	port?: number;
	deployStatus?: string;
	deployError?: string | null;
	deployStartedAt?: Date | null;
	updatedAt?: Date;
};

// ── Stale deploy detection ─────────────────────────────────────────────

export const STALE_DEPLOY_ERROR =
	"Web UI deploy timed out. The HermesHub process may have restarted during setup.";

function readStaleDeployThreshold(): number {
	const envValue = process.env.STALE_DEPLOY_THRESHOLD_MS;
	if (envValue) {
		const parsed = Number(envValue);
		if (!Number.isNaN(parsed) && parsed > 0) {
			return parsed;
		}
	}

	return 10 * 60 * 1000;
}

const STALE_DEPLOY_THRESHOLD_MS = readStaleDeployThreshold();

export function isStaleDeploy(deployStartedAt: Date | null): boolean {
	if (!deployStartedAt) {
		return true;
	}

	return Date.now() - deployStartedAt.getTime() > STALE_DEPLOY_THRESHOLD_MS;
}

// ── Deploy status normalization ────────────────────────────────────────

const DEPLOY_STATUSES = new Set<string>([
	"idle",
	"deploying",
	"succeeded",
	"failed",
]);

function normalizeDeployStatus(value: string): ServerWebUiDeployStatus {
	if (DEPLOY_STATUSES.has(value)) {
		return value as ServerWebUiDeployStatus;
	}

	return "idle";
}

// ── Snapshot construction ──────────────────────────────────────────────

export function buildWebUiSnapshot(
	serverId: string,
	record: ServerWebUiRecord,
): ServerWebUiSnapshot {
	return {
		enabled: record.enabled,
		port: record.port,
		proxyPath: getWebUiProxyPath(serverId),
		deployStatus: normalizeDeployStatus(record.deployStatus),
		deployError: record.deployError,
		deployStartedAt: record.deployStartedAt?.toISOString() ?? null,
		updatedAt: record.updatedAt.toISOString(),
	};
}

export function getWebUiProxyPath(serverId: string) {
	return `/api/servers/${serverId}/web-ui/proxy/`;
}

export async function getServerWebUiRecord(
	serverId: string,
): Promise<ServerWebUiRecord | null> {
	const [record] = await getDb()
		.select({
			enabled: serverWebUi.enabled,
			encryptedPassword: serverWebUi.encryptedPassword,
			port: serverWebUi.port,
			deployStatus: serverWebUi.deployStatus,
			deployError: serverWebUi.deployError,
			deployStartedAt: serverWebUi.deployStartedAt,
			updatedAt: serverWebUi.updatedAt,
		})
		.from(serverWebUi)
		.where(eq(serverWebUi.serverId, serverId))
		.limit(1);

	return record ?? null;
}

export async function upsertServerWebUiRecord(
	db: DbClient,
	patch: ServerWebUiUpsertPatch,
): Promise<void> {
	const now = patch.updatedAt ?? new Date();
	const updateSet: Partial<typeof serverWebUi.$inferInsert> = {
		updatedAt: now,
	};

	if (patch.enabled !== undefined) {
		updateSet.enabled = patch.enabled;
	}
	if (patch.encryptedPassword !== undefined) {
		updateSet.encryptedPassword = patch.encryptedPassword;
	}
	if (patch.port !== undefined) {
		updateSet.port = patch.port;
	}
	if (patch.deployStatus !== undefined) {
		updateSet.deployStatus = patch.deployStatus;
	}
	if (patch.deployError !== undefined) {
		updateSet.deployError = patch.deployError;
	}
	if (patch.deployStartedAt !== undefined) {
		updateSet.deployStartedAt = patch.deployStartedAt;
	}

	await db
		.insert(serverWebUi)
		.values({
			serverId: patch.serverId,
			enabled: patch.enabled ?? false,
			encryptedPassword: patch.encryptedPassword,
			port: patch.port ?? defaultHermesWebUiPort,
			deployStatus: patch.deployStatus ?? "idle",
			deployError: patch.deployError ?? null,
			deployStartedAt: patch.deployStartedAt ?? null,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: serverWebUi.serverId,
			set: updateSet,
		});
}

function isStaleDeployingRecord(record: ServerWebUiRecord): boolean {
	return (
		normalizeDeployStatus(record.deployStatus) === "deploying" &&
		isStaleDeploy(record.deployStartedAt)
	);
}

function buildStaleDeployWhereClause(
	serverId: string,
	record: ServerWebUiRecord,
) {
	const conditions = [
		eq(serverWebUi.serverId, serverId),
		eq(serverWebUi.deployStatus, "deploying"),
	];

	if (record.deployStartedAt === null) {
		conditions.push(isNull(serverWebUi.deployStartedAt));
	} else {
		conditions.push(eq(serverWebUi.deployStartedAt, record.deployStartedAt));
	}

	return and(...conditions);
}

export async function resolveServerWebUiRecord(
	serverId: string,
	record: ServerWebUiRecord | null,
): Promise<ServerWebUiRecord | null> {
	if (!record || !isStaleDeployingRecord(record)) {
		return record;
	}

	const updatedAt = new Date();
	const [updatedRecord] = await getDb()
		.update(serverWebUi)
		.set({
			deployStatus: "failed",
			deployError: STALE_DEPLOY_ERROR,
			deployStartedAt: null,
			updatedAt,
		})
		.where(buildStaleDeployWhereClause(serverId, record))
		.returning({
			enabled: serverWebUi.enabled,
			encryptedPassword: serverWebUi.encryptedPassword,
			port: serverWebUi.port,
			deployStatus: serverWebUi.deployStatus,
			deployError: serverWebUi.deployError,
			deployStartedAt: serverWebUi.deployStartedAt,
			updatedAt: serverWebUi.updatedAt,
		});

	if (!updatedRecord) {
		return getServerWebUiRecord(serverId);
	}

	return updatedRecord;
}

export async function getResolvedServerWebUiRecord(serverId: string) {
	const record = await getServerWebUiRecord(serverId);
	return resolveServerWebUiRecord(serverId, record);
}

export function decryptWebUiPassword(encryptedPassword: string | null) {
	if (!encryptedPassword) {
		return null;
	}

	try {
		return decryptSecret(encryptedPassword);
	} catch {
		return null;
	}
}
