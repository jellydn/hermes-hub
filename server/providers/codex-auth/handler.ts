import type { Context } from "hono";

import {
	buildCodexAuthStorePatch,
	HERMES_AUTH_JSON_INVALID_MESSAGE,
	mergeHermesAuthStore,
	parseCodexAuthStatus,
	readHermesAuthStore,
	writeHermesAuthJson,
} from "../../hermes/auth-json";
import {
	type DeployedHermesServerSsh,
	withDeployedHermesServerSsh,
} from "../../hermes/telegram-deploy-context";
import {
	type OwnedServerSshContext,
	requireAuthSession,
	requireOwnedServerSshById,
} from "../../request-guards";
import { withSshConnection } from "../../ssh";
import {
	CodexDeviceFlowError,
	exchangeCodexAuthorizationCode,
	pollCodexDeviceAuthorization,
	requestCodexDeviceCode,
} from "./device-flow";
import {
	clearCodexAuthSession,
	getCodexAuthSession,
	storeCodexAuthSession,
} from "./session-store";

type SshConnectionConfig = {
	host: string;
	port: number;
	username: string;
	authMethod: "password" | "ssh-key";
	credential: string;
	expectedFingerprint?: string;
};

function toSshConnectionConfig(
	sshCtx: OwnedServerSshContext,
): SshConnectionConfig {
	return {
		host: sshCtx.server.host,
		port: sshCtx.server.port,
		username: sshCtx.server.username,
		authMethod: sshCtx.authMethod,
		credential: sshCtx.credential,
		expectedFingerprint: sshCtx.server.hostKeyFingerprint ?? undefined,
	};
}

export async function startCodexAuth(context: Context) {
	return withDeployedHermesServerSsh(
		context,
		async ({ session, serverId, serverHost }) => {
			try {
				const deviceCode = await requestCodexDeviceCode();
				storeCodexAuthSession({
					...deviceCode,
					userId: session.user.id,
					serverId,
					createdAt: Date.now(),
				});

				return context.json({
					codexAuth: {
						userCode: deviceCode.userCode,
						verificationUrl: deviceCode.verificationUrl,
						expiresAt: deviceCode.expiresAt,
						pollIntervalSeconds: deviceCode.pollIntervalSeconds,
						serverHost,
					},
				});
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Unable to start Codex authentication.";
				return context.json({ error: message }, 502);
			}
		},
	);
}

export async function completeCodexAuth(context: Context) {
	const session = await requireAuthSession(context);
	if (session instanceof Response) {
		return session;
	}

	const authSession = getCodexAuthSession(session.user.id);
	if (!authSession) {
		return context.json(
			{
				error: "No active Codex login session. Start authentication again.",
			},
			400,
		);
	}

	try {
		const codeResponse = await pollCodexDeviceAuthorization({
			deviceAuthId: authSession.deviceAuthId,
			userCode: authSession.userCode,
		});
		const tokens = await exchangeCodexAuthorizationCode({
			authorizationCode: codeResponse.authorization_code,
			codeVerifier: codeResponse.code_verifier,
		});
		const lastRefresh = new Date().toISOString();
		const patch = buildCodexAuthStorePatch(tokens, lastRefresh);

		const sshCtx = await requireOwnedServerSshById(
			context,
			authSession.serverId,
			session,
		);
		if (sshCtx instanceof Response) {
			return sshCtx;
		}

		if (sshCtx.serverId !== authSession.serverId) {
			clearCodexAuthSession(session.user.id);
			return context.json(
				{
					error:
						"Codex login session no longer matches the deployed server. Start authentication again.",
				},
				400,
			);
		}

		await withSshConnection(toSshConnectionConfig(sshCtx), async (ssh) => {
			const existingStore =
				(await readHermesAuthStore(ssh, HERMES_AUTH_JSON_INVALID_MESSAGE)) ??
				{};
			const merged = mergeHermesAuthStore(existingStore, patch);
			await writeHermesAuthJson(ssh, `${JSON.stringify(merged, null, 2)}\n`);
		});

		clearCodexAuthSession(session.user.id);

		return context.json({
			status: "authenticated",
			serverHost: sshCtx.server.host,
			authMode: "chatgpt",
			lastRefresh,
		});
	} catch (error) {
		if (error instanceof CodexDeviceFlowError) {
			if (error.code === "poll_pending") {
				return context.json({ status: "pending" });
			}

			if (error.code === "timeout") {
				clearCodexAuthSession(session.user.id);
			}

			return context.json({ error: error.message }, 400);
		}

		const message =
			error instanceof Error ? error.message : "Codex authentication failed.";
		return context.json({ error: message }, 502);
	}
}

export async function getCodexAuthStatus(context: Context) {
	return withDeployedHermesServerSsh(
		context,
		async ({ serverHost, sshCtx }: DeployedHermesServerSsh) => {
			try {
				const status = await withSshConnection(
					toSshConnectionConfig(sshCtx),
					async (ssh) => {
						const store = await readHermesAuthStore(ssh);
						return parseCodexAuthStatus(store);
					},
				);

				return context.json({
					codexAuth: {
						...status,
						serverHost,
					},
				});
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Unable to check Codex authentication status.";
				return context.json({ error: message }, 502);
			}
		},
	);
}

export async function resolveRemoteCodexAuthStatus(input: SshConnectionConfig) {
	return withSshConnection(input, async (ssh) => {
		const store = await readHermesAuthStore(ssh);
		return parseCodexAuthStatus(store);
	});
}
