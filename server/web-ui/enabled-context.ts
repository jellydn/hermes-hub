import type { Context } from "hono";

import {
	type OwnedServerSshContext,
	requireOwnedServerSsh,
} from "../request-guards";
import { getServerWebUiRecord, type ServerWebUiRecord } from "./records";

export type EnabledWebUiContext = OwnedServerSshContext & {
	webUi: ServerWebUiRecord;
};

function isResponse(value: unknown): value is Response {
	return value instanceof Response;
}

export async function requireEnabledWebUi(
	context: Context,
): Promise<EnabledWebUiContext | Response> {
	const owned = await requireOwnedServerSsh(context);
	if (isResponse(owned)) {
		return owned;
	}

	const webUi = await getServerWebUiRecord(owned.serverId);
	if (!webUi?.enabled) {
		return context.json(
			{ error: "Hermes Web UI is not enabled on this server." },
			400,
		);
	}

	return { ...owned, webUi };
}
