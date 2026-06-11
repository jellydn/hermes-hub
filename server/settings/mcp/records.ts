import { and, asc, eq } from "drizzle-orm";

import { getDb } from "#server/db";
import { mcpServers } from "#server/db/schema";
import type { McpServerSummary } from "./config";
import { toMcpServerSummary } from "./config";
import {
	encryptSecretMap,
	resolveSecretMapOnUpdate,
	type SecretKeyInput,
} from "./secrets";
import type { EncryptedSecretMap } from "./types";

type DbWriter = Pick<
	ReturnType<typeof getDb>,
	"select" | "insert" | "update" | "delete"
>;

export type StoredMcpServerRecord = typeof mcpServers.$inferSelect;

export async function listMcpServerRecords(
	userId: string,
): Promise<StoredMcpServerRecord[]> {
	const db = getDb();

	return db
		.select()
		.from(mcpServers)
		.where(eq(mcpServers.userId, userId))
		.orderBy(asc(mcpServers.name));
}

export async function getCurrentMcpServers(
	userId: string,
): Promise<McpServerSummary[]> {
	const records = await listMcpServerRecords(userId);
	return records.map(toMcpServerSummary);
}

export async function getOwnedMcpServerRecord(
	userId: string,
	serverId: string,
): Promise<StoredMcpServerRecord | null> {
	const db = getDb();

	const [record] = await db
		.select()
		.from(mcpServers)
		.where(and(eq(mcpServers.userId, userId), eq(mcpServers.id, serverId)))
		.limit(1);

	return record ?? null;
}

export async function getMcpServerByName(
	userId: string,
	name: string,
): Promise<StoredMcpServerRecord | null> {
	const db = getDb();

	const [record] = await db
		.select()
		.from(mcpServers)
		.where(and(eq(mcpServers.userId, userId), eq(mcpServers.name, name)))
		.limit(1);

	return record ?? null;
}

type CreateMcpServerInput = {
	userId: string;
	name: string;
	transport: string;
	enabled: boolean;
	command: string | null;
	args: string[];
	url: string | null;
	env: SecretKeyInput[];
	headers: SecretKeyInput[];
	toolsInclude: string[];
	toolsExclude: string[];
	toolsResources: boolean;
	toolsPrompts: boolean;
	timeout: number | null;
	connectTimeout: number | null;
	supportsParallelToolCalls: boolean;
};

type NormalizedMcpServerFields = {
	transport: string;
	command: string | null;
	args: string[];
	url: string | null;
	encryptedEnv: EncryptedSecretMap;
	encryptedHeaders: EncryptedSecretMap;
};

function normalizeTransportFields(
	input: Pick<
		CreateMcpServerInput,
		"transport" | "command" | "args" | "url" | "env" | "headers"
	>,
): NormalizedMcpServerFields {
	if (input.transport === "stdio") {
		return {
			transport: input.transport,
			command: input.command,
			args: input.args,
			url: null,
			encryptedEnv: encryptSecretMap(input.env),
			encryptedHeaders: {},
		};
	}

	return {
		transport: input.transport,
		command: null,
		args: [],
		url: input.url,
		encryptedEnv: {},
		encryptedHeaders: encryptSecretMap(input.headers),
	};
}

export async function createMcpServerRecord(
	writer: DbWriter,
	input: CreateMcpServerInput,
): Promise<McpServerSummary> {
	const normalized = normalizeTransportFields(input);

	const [record] = await writer
		.insert(mcpServers)
		.values({
			userId: input.userId,
			name: input.name,
			transport: normalized.transport,
			enabled: input.enabled,
			command: normalized.command,
			args: normalized.args,
			url: normalized.url,
			encryptedEnv: normalized.encryptedEnv,
			encryptedHeaders: normalized.encryptedHeaders,
			toolsInclude: input.toolsInclude,
			toolsExclude: input.toolsExclude,
			toolsResources: input.toolsResources,
			toolsPrompts: input.toolsPrompts,
			timeout: input.timeout,
			connectTimeout: input.connectTimeout,
			supportsParallelToolCalls: input.supportsParallelToolCalls,
		})
		.returning();

	if (!record) {
		throw new Error("Unable to create MCP server.");
	}

	return toMcpServerSummary(record);
}

type UpdateMcpServerInput = CreateMcpServerInput & {
	serverId: string;
	existing: StoredMcpServerRecord;
};

export async function updateMcpServerRecord(
	writer: DbWriter,
	input: UpdateMcpServerInput,
): Promise<McpServerSummary> {
	const normalized = normalizeTransportFields(input);

	const encryptedEnv =
		input.transport === "stdio"
			? resolveSecretMapOnUpdate(input.existing.encryptedEnv, input.env)
			: normalized.encryptedEnv;
	const encryptedHeaders =
		input.transport === "http"
			? resolveSecretMapOnUpdate(input.existing.encryptedHeaders, input.headers)
			: normalized.encryptedHeaders;

	const [record] = await writer
		.update(mcpServers)
		.set({
			name: input.name,
			transport: normalized.transport,
			enabled: input.enabled,
			command: normalized.command,
			args: normalized.args,
			url: normalized.url,
			encryptedEnv,
			encryptedHeaders,
			toolsInclude: input.toolsInclude,
			toolsExclude: input.toolsExclude,
			toolsResources: input.toolsResources,
			toolsPrompts: input.toolsPrompts,
			timeout: input.timeout,
			connectTimeout: input.connectTimeout,
			supportsParallelToolCalls: input.supportsParallelToolCalls,
		})
		.where(
			and(
				eq(mcpServers.userId, input.userId),
				eq(mcpServers.id, input.serverId),
			),
		)
		.returning();

	if (!record) {
		throw new Error("Unable to update MCP server.");
	}

	return toMcpServerSummary(record);
}

export async function deleteMcpServerRecord(
	writer: DbWriter,
	userId: string,
	serverId: string,
): Promise<StoredMcpServerRecord | null> {
	const [record] = await writer
		.delete(mcpServers)
		.where(and(eq(mcpServers.userId, userId), eq(mcpServers.id, serverId)))
		.returning();

	return record ?? null;
}
