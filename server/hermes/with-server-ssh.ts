import type { Context } from "hono";
import type { NodeSSH } from "node-ssh";

import type { AuthSession, OwnedServerSshContext } from "../request-guards";
import { withSshConnection } from "../ssh";
import { resolveHermesDeployContext } from "./deploy-context";

export async function withHermesServerSsh<T>(
	context: Context,
	session: AuthSession,
	serverId: string | undefined,
	run: (ssh: NodeSSH, sshCtx: OwnedServerSshContext) => Promise<T>,
): Promise<T | Response> {
	const deployCtx = await resolveHermesDeployContext(
		context,
		session,
		serverId,
	);
	if (deployCtx instanceof Response) {
		return deployCtx;
	}

	const { sshCtx } = deployCtx;

	return withSshConnection(
		{
			host: sshCtx.server.host,
			port: sshCtx.server.port,
			username: sshCtx.server.username,
			authMethod: sshCtx.authMethod,
			credential: sshCtx.credential,
			expectedFingerprint: sshCtx.server.hostKeyFingerprint ?? undefined,
			requireHostKeyPin: true,
		},
		async (ssh) => run(ssh, sshCtx),
	);
}
