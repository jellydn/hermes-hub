import type { Context } from "hono";

import { getAuthSession } from "../auth";
import {
	getOwnedServerRecord,
	type OwnedServerRecord,
	resolveServerSshConfigOrError,
} from "../server-records";
import type { SshAuthMethod } from "../ssh";
import { getServerWebUiRecord, type ServerWebUiRecord } from "./records";

export type OwnedServerContext = {
	session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>;
	server: OwnedServerRecord;
	serverId: string;
};

export type OwnedServerSshContext = OwnedServerContext & {
	authMethod: SshAuthMethod;
	credential: string;
};

export type EnabledWebUiContext = OwnedServerSshContext & {
	webUi: ServerWebUiRecord;
};

function isResponse(value: unknown): value is Response {
	return value instanceof Response;
}

export async function requireOwnedServer(
	context: Context,
): Promise<OwnedServerContext | Response> {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	const server = await getOwnedServerRecord({
		serverId,
		userId: session.user.id,
	});
	if (!server) {
		return context.json({ error: "Server not found" }, 404);
	}

	return { session, server, serverId };
}

export async function requireOwnedServerSsh(
	context: Context,
): Promise<OwnedServerSshContext | Response> {
	const owned = await requireOwnedServer(context);
	if (isResponse(owned)) {
		return owned;
	}

	const sshResult = resolveServerSshConfigOrError(
		owned.server,
		owned.session.session.id,
	);
	if (!sshResult.ok) {
		return context.json({ error: sshResult.error }, 400);
	}

	return {
		...owned,
		authMethod: sshResult.authMethod,
		credential: sshResult.credential,
	};
}

export async function requireEnabledWebUi(
	context: Context,
): Promise<EnabledWebUiContext | Response> {
	const owned = await requireOwnedServerSsh(context);
	if (isResponse(owned)) {
		return owned;
	}

	const webUi = await getServerWebUiRecord(owned.serverId);
	if (!webUi?.enabled) {
		return context.json(
			{ error: "Hermes Web UI is not enabled on this server." },
			400,
		);
	}

	return { ...owned, webUi };
}
