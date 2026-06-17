import type { Context } from "hono";

import { getClientIp } from "./get-client-ip";
import { logger } from "./logger";

/**
 * Matches the event-name convention: snake_case subject ending in `_failed`.
 * Used by `logHandlerFailure` to emit a non-fatal warning when a caller
 * forgets the suffix or camelCases the identifier; tests pin the pattern
 * so the convention cannot drift.
 */
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]*_failed$/;

/**
 * Log a structured handler-failure event from a Hono catch block.
 *
 * Use this for any catch where the cause is operational (network, SSH,
 * upstream service, deployment orchestration, persistence) and operators
 * need to diagnose the failure from the log stream alone. Do NOT call this
 * for purely client-side validation failures (400-class) — those are already
 * surfaced to the client via the response body and would just be noise.
 *
 * ─── Event-name schema ───────────────────────────────────────────────
 *
 * The `event` field is the structured discriminator operators grep / JQ /
 * monitor against. The schema is:
 *
 *   • Format       — snake_case, ASCII-only, no punctuation beyond `_`.
 *   • Subject      — what failed. Keep it terse and domain-scoped, e.g.
 *                    `web_ui_proxy` (not `web_ui_proxy_request_attempt`).
 *   • Verb         — implicit. There is no `_error` or `_exception`
 *                    suffix; this helper only emits failures, so `_failed`
 *                    is the only verb allowed and is always present.
 *   • Suffix       — `_failed` is mandatory. The helper does not auto-add
 *                    it; forgetting it produces a misleading log line.
 *                    tests pin the convention so greppable invariants stay
 *                    stable.
 *   • Plurality    — singular. One event = one failure emit.
 *
 * Existing names:  `web_ui_proxy_failed` (since June 2026, in production).
 *
 * Candidate names from the operational-failure audit (June 2026) — these
 * are the pending rollouts if/when this helper is wired into the existing
 * silent-catch sites:
 *   `telegram_deploy_failed`,
 *   `telegram_switch_failed`,
 *   `provider_deploy_failed`,
 *   `hermes_agent_deploy_failed`,
 *   `server_action_failed`,
 *   `server_health_check_failed`,
 *   `server_connect_failed`,
 *   `telegram_pairing_list_failed`,
 *   `telegram_pairing_approve_failed`,
 *   `codex_auth_start_failed`,
 *   `codex_auth_complete_failed`,
 *   `codex_auth_status_failed`,
 *   `provider_test_failed`,
 *   `subscription_test_failed`.
 *
 * ─── Structured-fields contract ──────────────────────────────────────
 *
 * pino emits one JSON line with these always-typed fields:
 *   • `event`     — discriminator (see schema above).
 *   • `userId`    — opaque session UUID; `null` for unauthenticated paths.
 *   • `ipAddress` — best-effort from the request; no PII beyond the IP.
 *   • `method`    — HTTP method of the failing request.
 *   • `err`       — the raw Error / cause. pino's `stdSerializers.err`
 *                    applies, producing `{type, message, stack}`.
 *
 * Caller-supplied `extras` are spread alongside these. Suggested field
 * conventions per failure category:
 *   • network failures: `serverId`, `port`, `upstreamPath`,
 *                      `upstreamUnreachable: boolean`.
 *   • deploy failures:  `serverId`, `serverHost`, `intent` (the
 *                      `managed-compose-deploy` intent enum).
 *   • server-action:    `serverId`, `action`, `imageRef`.
 *   • pairings:         `serverId`, `code`, `locked: boolean`.
 *
 * ─── Audit log is separate, not a substitute ──────────────────────────
 *
 * The `audit_logs` row is best-effort (the catch's audit_insert may itself
 * fail), aimed at user-visible history, and lives in a separate table from
 * operator-facing logs. Always emit BOTH the audit row AND this helper
 * call for operational failure paths; the structured log line is what
 * makes the failure observable to an operator grepping the log stream.
 */
export function logHandlerFailure(input: {
	context: Context;
	event: string;
	userId: string | null;
	extras?: Record<string, unknown>;
	error: unknown;
}): void {
	if (!EVENT_NAME_PATTERN.test(input.event)) {
		// Non-fatal: the failure path must still log the real error, but a
		// wrong-shape name silently breaks the operator's grep pipeline, so
		// we surface the convention violation as a separate warn line.
		logger.warn(
			{ event: input.event, pattern: EVENT_NAME_PATTERN.source },
			"handler-error-log: event name does not match snake_case + _failed convention",
		);
	}

	logger.error(
		{
			event: input.event,
			userId: input.userId,
			ipAddress: getClientIp(input.context),
			method: input.context.req.raw.method,
			...(input.extras ?? {}),
			err: input.error,
		},
		input.event,
	);
}
