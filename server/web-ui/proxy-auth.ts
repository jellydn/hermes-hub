import type { Context } from "hono";

import { isResponse } from "../lib/is-response";
import { requireOwnedServerSsh } from "../request-guards";
import type { EnabledWebUiContext } from "./proxy-types";
import { getResolvedServerWebUiRecord } from "./records";

export async function requireEnabledWebUi(
	context: Context,
): Promise<EnabledWebUiContext | Response> {
	const owned = await requireOwnedServerSsh(context);
	if (isResponse(owned)) {
		return owned;
	}

	const webUi = await getResolvedServerWebUiRecord(owned.serverId);
	if (!webUi?.enabled) {
		return context.json(
			{ error: "Hermes Web UI is not enabled on this server." },
			400,
		);
	}

	return { ...owned, webUi };
}
