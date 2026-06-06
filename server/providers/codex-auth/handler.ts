import type { Context } from "hono";

import {
	buildCodexAuthStorePatch,
	mergeHermesAuthStore,
	parseCodexAuthStatus,
	readHermesAuthJson,
	writeHermesAuthJson,
} from "../../hermes/auth-json";
import { resolveTelegramHermesDeployContext } from "../../hermes/telegram-deploy-context";
import { requireAuthSession } from "../../request-guards";
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

async function withTelegramHermesSsh(
	context: Context,
	handler: (input: {
		serverId: string;
		serverHost: string;
		sshConfig: {
			host: string;
			port: number;
			username: string;
			authMethod: "password" | "ssh-key";
			credential: string;
			expectedFingerprint?: string;
		};
	}) => Promise<Response>,
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
		serverId: sshCtx.serverId,
		serverHost: sshCtx.server.host,
		sshConfig: {
			host: sshCtx.server.host,
			port: sshCtx.server.port,
			username: sshCtx.server.username,
			authMethod: sshCtx.authMethod,
			credential: sshCtx.credential,
			expectedFingerprint: sshCtx.server.hostKeyFingerprint ?? undefined,
		},
	});
}

export async function startCodexAuth(context: Context) {
	return withTelegramHermesSsh(context, async ({ serverId, serverHost }) => {
		const session = await requireAuthSession(context);
		if (session instanceof Response) {
			return session;
		}

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
	});
}

export async function completeCodexAuth(context: Context) {
	return withTelegramHermesSsh(context, async ({ serverHost, sshConfig }) => {
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

			await withSshConnection(sshConfig, async (ssh) => {
				const existingRaw = await readHermesAuthJson(ssh);
				let existingStore: Record<string, unknown> = {};
				if (existingRaw.trim()) {
					try {
						existingStore = JSON.parse(existingRaw) as Record<string, unknown>;
					} catch {
						throw new Error(
							"Remote Hermes auth.json is not valid JSON. Fix it on the VPS before continuing.",
						);
					}
				}

				const merged = mergeHermesAuthStore(existingStore, patch);
				await writeHermesAuthJson(ssh, `${JSON.stringify(merged, null, 2)}\n`);
			});

			clearCodexAuthSession(session.user.id);

			return context.json({
				status: "authenticated",
				serverHost,
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
	});
}

export async function getCodexAuthStatus(context: Context) {
	return withTelegramHermesSsh(context, async ({ serverHost, sshConfig }) => {
		try {
			const status = await withSshConnection(sshConfig, async (ssh) => {
				const existingRaw = await readHermesAuthJson(ssh);
				if (!existingRaw.trim()) {
					return parseCodexAuthStatus(null);
				}

				let parsed: unknown;
				try {
					parsed = JSON.parse(existingRaw);
				} catch {
					throw new Error("Remote Hermes auth.json is not valid JSON.");
				}

				return parseCodexAuthStatus(parsed);
			});

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
	});
}

export async function resolveRemoteCodexAuthStatus(input: {
	host: string;
	port: number;
	username: string;
	authMethod: "password" | "ssh-key";
	credential: string;
	expectedFingerprint?: string;
}) {
	return withSshConnection(input, async (ssh) => {
		const existingRaw = await readHermesAuthJson(ssh);
		if (!existingRaw.trim()) {
			return parseCodexAuthStatus(null);
		}

		try {
			return parseCodexAuthStatus(JSON.parse(existingRaw));
		} catch {
			throw new Error("Remote Hermes auth.json is not valid JSON.");
		}
	});
}
