import type { Context } from "hono";
import { getAuthSession } from "../auth";
import {
	getServerById,
	resolveServerSshConfigOrError,
	type ServerConnectionRecord,
} from "../server-records";
import { type SshAuthMethod, shellQuote, withSshConnection } from "../ssh";
import type {
	TelegramPairingApproveRequest,
	TelegramPairingSummary,
} from "./config";
import { getLatestTelegramRecord } from "./records";

async function getDeployedTelegramServer(
	session: Awaited<ReturnType<typeof getAuthSession>>,
): Promise<
	| { response: Response }
	| {
			serverRecord: ServerConnectionRecord;
			authMethod: SshAuthMethod;
			credential: string;
	  }
> {
	if (!session) {
		return {
			response: Response.json({ error: "Unauthorized" }, { status: 401 }),
		};
	}

	const record = await getLatestTelegramRecord(session.user.id);
	if (!record?.isActive || !record.deployedServerId) {
		return {
			response: Response.json(
				{ error: "Deploy Telegram to a server before managing pairings." },
				{ status: 400 },
			),
		};
	}

	const serverRecord = await getServerById(record.deployedServerId);
	if (!serverRecord) {
		return {
			response: Response.json(
				{ error: "Deployed server not found." },
				{ status: 404 },
			),
		};
	}

	const sshResult = resolveServerSshConfigOrError(
		serverRecord,
		session.session.id,
	);
	if (!sshResult.ok) {
		return {
			response: Response.json({ error: sshResult.error }, { status: 400 }),
		};
	}

	return {
		serverRecord,
		authMethod: sshResult.authMethod,
		credential: sshResult.credential,
	};
}

async function runHermesPairingJsonCommand(
	serverRecord: ServerConnectionRecord,
	authMethod: SshAuthMethod,
	credential: string,
	pythonCode: string,
	env: Record<string, string> = {},
) {
	const envArgs = Object.entries(env)
		.map(([key, value]) => `-e ${shellQuote(`${key}=${value}`)}`)
		.join(" ");
	const repairPairingOwnershipCommand = [
		"docker exec hermes sh -lc",
		shellQuote(
			'chown -R hermes:hermes "$HERMES_HOME/platforms/pairing" 2>/dev/null || chown -R hermes:hermes /opt/data/platforms/pairing 2>/dev/null || true',
		),
	].join(" ");
	const pairingCommand = [
		"docker exec --user hermes",
		envArgs,
		"hermes python -c",
		shellQuote(pythonCode),
	]
		.filter(Boolean)
		.join(" ");
	const command = `${repairPairingOwnershipCommand} && ${pairingCommand}`;

	return withSshConnection(
		{
			host: serverRecord.host,
			port: serverRecord.port,
			username: serverRecord.username,
			authMethod,
			credential,
			expectedFingerprint: serverRecord.hostKeyFingerprint ?? undefined,
		},
		async (ssh) => {
			const result = await ssh.execCommand(command, {
				execOptions: { timeout: 30_000 },
			});
			if (result.code !== 0) {
				throw new Error(result.stderr || "Hermes pairing command failed.");
			}

			try {
				return JSON.parse(result.stdout.trim()) as unknown;
			} catch {
				throw new Error(
					`Invalid pairing response: ${result.stdout.slice(0, 200)}`,
				);
			}
		},
	);
}

function parsePairingSummary(payload: unknown): TelegramPairingSummary {
	const record =
		payload && typeof payload === "object"
			? (payload as Record<string, unknown>)
			: {};
	const pending = Array.isArray(record.pending) ? record.pending : [];
	const approved = Array.isArray(record.approved) ? record.approved : [];

	return {
		pending: pending.map((entry) => {
			const item =
				entry && typeof entry === "object"
					? (entry as Record<string, unknown>)
					: {};
			return {
				code: String(item.code ?? ""),
				userId: String(item.user_id ?? ""),
				userName: String(item.user_name ?? ""),
				ageMinutes: Number(item.age_minutes ?? 0),
			};
		}),
		approved: approved.map((entry) => {
			const item =
				entry && typeof entry === "object"
					? (entry as Record<string, unknown>)
					: {};
			return {
				userId: String(item.user_id ?? ""),
				userName: String(item.user_name ?? ""),
				approvedAt:
					typeof item.approved_at === "number" ? item.approved_at : null,
			};
		}),
	};
}

export async function listTelegramPairings(
	context: Context,
): Promise<Response> {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const deployedServer = await getDeployedTelegramServer(session);
	if ("response" in deployedServer) {
		return deployedServer.response;
	}

	try {
		const result = await runHermesPairingJsonCommand(
			deployedServer.serverRecord,
			deployedServer.authMethod,
			deployedServer.credential,
			'import json; from gateway.pairing import PairingStore; store = PairingStore(); print(json.dumps({"pending": store.list_pending("telegram"), "approved": store.list_approved("telegram")}))',
		);

		return context.json({ pairings: parsePairingSummary(result) });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unable to load pairings";
		return context.json({ error: message }, 502);
	}
}

type PairingApproveResult = {
	approved: { user_id: string; user_name: string } | null;
	locked: boolean;
};

function parsePairingApproveResult(raw: unknown): PairingApproveResult {
	const obj =
		raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

	const approvedRaw = obj.approved;
	const approved =
		approvedRaw && typeof approvedRaw === "object"
			? {
					user_id: String(
						(approvedRaw as Record<string, unknown>).user_id ?? "",
					),
					user_name: String(
						(approvedRaw as Record<string, unknown>).user_name ?? "",
					),
				}
			: null;

	return {
		approved,
		locked: Boolean(obj.locked),
	};
}

export async function approveTelegramPairing(
	context: Context,
): Promise<Response> {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: TelegramPairingApproveRequest;
	try {
		payload = await context.req.json<TelegramPairingApproveRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const code = payload.code?.trim().toUpperCase() ?? "";
	if (!/^[A-Z2-9]{8}$/.test(code)) {
		return context.json({ error: "Pairing code must be 8 characters." }, 400);
	}

	const deployedServer = await getDeployedTelegramServer(session);
	if ("response" in deployedServer) {
		return deployedServer.response;
	}

	try {
		const result = await runHermesPairingJsonCommand(
			deployedServer.serverRecord,
			deployedServer.authMethod,
			deployedServer.credential,
			[
				"import json, os",
				"from gateway.pairing import PairingStore",
				"store = PairingStore()",
				'result = store.approve_code("telegram", os.environ["PAIRING_CODE"])',
				'print(json.dumps({"approved": result, "locked": store._is_locked_out("telegram")}))',
			].join("; "),
			{ PAIRING_CODE: code },
		);

		const { approved, locked } = parsePairingApproveResult(result);

		if (!approved) {
			return context.json(
				{
					error: locked
						? "Telegram pairing approvals are temporarily locked after too many failed attempts."
						: "Pairing code not found or expired.",
				},
				400,
			);
		}

		return context.json({
			approved: { userId: approved.user_id, userName: approved.user_name },
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unable to approve pairing";
		return context.json({ error: message }, 502);
	}
}
