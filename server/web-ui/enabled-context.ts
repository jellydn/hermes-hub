import type { Context } from "hono";

import { isResponse } from "../lib/is-response";
import {
	type OwnedServerSshContext,
	requireOwnedServerSsh,
} from "../request-guards";
import {
	getResolvedServerWebUiRecord,
	type ServerWebUiRecord,
} from "./records";

export type EnabledWebUiContext = OwnedServerSshContext & {
	webUi: ServerWebUiRecord;
};

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
