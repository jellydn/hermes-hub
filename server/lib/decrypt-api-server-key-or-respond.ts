import type { Context } from "hono";

import { decryptApiServerKey } from "../crypto";
import { logger } from "./logger";

export type DecryptOrResponse =
	| { ok: true; value: string }
	| { ok: false; response: Response };

/**
 * Wraps the strict `decryptApiServerKey` contract (plan 005) so Hono
 * handlers stay flat instead of duplicating a try/catch.
 *
 * - Empty / null / undefined payload -> `{ ok: true, value: "" }`
 *   (matches `decryptApiServerKey("")` documented contract; we
 *   intentionally do NOT 502 an empty payload because that's a
 *   separate upstream validation concern).
 * - On a successful decrypt -> `{ ok: true, value }`.
 * - On any thrown error from `decryptApiServerKey` (legacy plaintext,
 *   malformed AES-GCM, etc.) -> logs a structured `warn` carrying the
 *   actionable message, then returns `{ ok: false, response }`
 *   where `response` is a Hono 502 carrying the same actionable
 *   message verbatim. Callers should `return decryptResult.response`
 *   so the operator-facing 502 path stays consistent across handlers.
 */
export function decryptApiServerKeyOrRespond(
	payload: string | null | undefined,
	context: Context,
): DecryptOrResponse {
	if (!payload) {
		return { ok: true, value: "" };
	}

	try {
		return { ok: true, value: decryptApiServerKey(payload) };
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unable to decrypt API server key";
		logger.warn(
			{ error: message },
			"decryptApiServerKey failed in HTTP handler",
		);
		return { ok: false, response: context.json({ error: message }, 502) };
	}
}
