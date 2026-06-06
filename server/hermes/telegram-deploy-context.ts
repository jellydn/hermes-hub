import type { Context } from "hono";

import { getTelegramDeployInfo } from "../providers/records";
import {
	type AuthSession,
	type OwnedServerSshContext,
	requireAuthSession,
	requireOwnedServerSshById,
} from "../request-guards";

export const NO_HERMES_DEPLOYMENT_ERROR =
	"No Hermes deployment found. Deploy a Telegram bot to a server first.";

export type TelegramHermesDeployContext = {
	telegramInfo: NonNullable<Awaited<ReturnType<typeof getTelegramDeployInfo>>>;
	sshCtx: OwnedServerSshContext;
};

export type DeployedHermesServerSsh = {
	session: AuthSession;
	serverId: string;
	serverHost: string;
	sshCtx: OwnedServerSshContext;
};

export async function withDeployedHermesServerSsh(
	context: Context,
	handler: (input: DeployedHermesServerSsh) => Promise<Response>,
): Promise<Response> {
	const session = await requireAuthSession(context);
	if (session instanceof Response) {
		return session;
	}

	const deployCtx = await resolveTelegramHermesDeployContext(context, session);
	if (deployCtx instanceof Response) {
		return deployCtx;
	}

	const { sshCtx } = deployCtx;

	return handler({
		session,
		serverId: sshCtx.serverId,
		serverHost: sshCtx.server.host,
		sshCtx,
	});
}

export async function resolveTelegramHermesDeployContext(
	context: Context,
	session?: AuthSession,
): Promise<TelegramHermesDeployContext | Response> {
	const resolvedSession = session ?? (await requireAuthSession(context));
	if (resolvedSession instanceof Response) {
		return resolvedSession;
	}

	const telegramInfo = await getTelegramDeployInfo(resolvedSession.user.id);
	if (!telegramInfo?.deployedServerId) {
		return context.json({ error: NO_HERMES_DEPLOYMENT_ERROR }, 400);
	}

	const sshCtx = await requireOwnedServerSshById(
		context,
		telegramInfo.deployedServerId,
		resolvedSession,
	);
	if (sshCtx instanceof Response) {
		return sshCtx;
	}

	return { telegramInfo, sshCtx };
}
