import type { Context } from "hono";

import {
	type AuthSession,
	type OwnedServerSshContext,
	requireAuthSession,
	requireOwnedServerSshById,
} from "../request-guards";
import { listHermesDeploymentTargets } from "./deploy-targets";

export const NO_HERMES_AGENT_ERROR =
	"No deployed Hermes agent found. Install Hermes on a server first.";

const NO_SUCCESSFUL_INSTALL_ERROR =
	"Selected server does not have a successful Hermes install.";

export type HermesDeployContext = {
	sshCtx: OwnedServerSshContext;
};

export async function resolveHermesDeployContext(
	context: Context,
	session?: AuthSession,
	serverId?: string,
): Promise<HermesDeployContext | Response> {
	const resolvedSession = session ?? (await requireAuthSession(context));
	if (resolvedSession instanceof Response) {
		return resolvedSession;
	}

	const targets = await listHermesDeploymentTargets(resolvedSession.user.id);
	if (targets.length === 0) {
		return context.json({ error: NO_HERMES_AGENT_ERROR }, 400);
	}

	const targetServerId = serverId ?? targets[0]?.serverId;
	if (!targetServerId) {
		return context.json({ error: NO_HERMES_AGENT_ERROR }, 400);
	}

	const isEligibleTarget = targets.some(
		(target) => target.serverId === targetServerId,
	);
	if (!isEligibleTarget) {
		return context.json({ error: NO_SUCCESSFUL_INSTALL_ERROR }, 400);
	}

	const sshCtx = await requireOwnedServerSshById(
		context,
		targetServerId,
		resolvedSession,
	);
	if (sshCtx instanceof Response) {
		return sshCtx;
	}

	return { sshCtx };
}
