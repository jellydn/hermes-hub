// ── Helpers ─────────────────────────────────────────────────────────

import { decryptStoredApiKey, getApiKeyLast4 } from "../records";

export function decryptAndGetLast4(
	encrypted: string,
): { ok: true; keyLast4: string | null } | { ok: false } {
	if (!encrypted) return { ok: false };
	const decrypted = decryptStoredApiKey(encrypted);
	if (!decrypted.ok || !decrypted.apiKey) return { ok: false };
	return { ok: true, keyLast4: getApiKeyLast4(decrypted.apiKey) };
}
