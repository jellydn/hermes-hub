import type { getDb } from "../db";
import { auditLogs } from "../db/schema";
import { getNonEmptyString } from "./non-empty-string";

export type InsertAuditLogInput = {
	userId: string;
	action: string;
	serverId?: string | null;
	details?: Record<string, unknown> | null;
	ipAddress?: string | null;
};

type AuditLogWriter = Pick<ReturnType<typeof getDb>, "insert">;

export async function insertAuditLog(
	writer: AuditLogWriter,
	input: InsertAuditLogInput,
) {
	const details = input.details ?? null;
	const resolvedServerId =
		input.serverId ??
		(details && typeof details === "object" && "serverId" in details
			? getNonEmptyString(details.serverId)
			: null);

	await writer.insert(auditLogs).values({
		userId: input.userId,
		action: input.action,
		details,
		ipAddress: input.ipAddress ?? null,
		serverId: resolvedServerId,
	});
}
