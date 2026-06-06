import type { Context } from "hono";

import { getAuthSession } from "./auth";
import {
	getOwnedServerRecord,
	type OwnedServerRecord,
	resolveServerSshConfigOrError,
} from "./server-records";
import type { SshAuthMethod } from "./ssh";

export type AuthSession = NonNullable<
	Awaited<ReturnType<typeof getAuthSession>>
>;

export type OwnedServerContext = {
	session: AuthSession;
	server: OwnedServerRecord;
	serverId: string;
};

export type OwnedServerSshContext = OwnedServerContext & {
	authMethod: SshAuthMethod;
	credential: string;
};

function isResponse(value: unknown): value is Response {
	return value instanceof Response;
}

export async function requireAuthSession(
	context: Context,
): Promise<AuthSession | Response> {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	return session;
}

async function requireOwnedServerById(
	context: Context,
	serverId: string,
	session?: AuthSession,
): Promise<OwnedServerContext | Response> {
	const resolvedSession = session ?? (await requireAuthSession(context));
	if (isResponse(resolvedSession)) {
		return resolvedSession;
	}

	const server = await getOwnedServerRecord({
		serverId,
		userId: resolvedSession.user.id,
	});
	if (!server) {
		return context.json({ error: "Server not found" }, 404);
	}

	return { session: resolvedSession, server, serverId };
}

export async function requireOwnedServer(
	context: Context,
): Promise<OwnedServerContext | Response> {
	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	return requireOwnedServerById(context, serverId);
}

export async function requireOwnedServerSshById(
	context: Context,
	serverId: string,
	session?: AuthSession,
): Promise<OwnedServerSshContext | Response> {
	const owned = await requireOwnedServerById(context, serverId, session);
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

export async function requireOwnedServerSsh(
	context: Context,
): Promise<OwnedServerSshContext | Response> {
	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	return requireOwnedServerSshById(context, serverId);
}
