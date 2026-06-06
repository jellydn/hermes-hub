export function parseDeployServerIdBody(
	payload: unknown,
): { ok: true; serverId?: string } | { ok: false; error: string } {
	if (payload === undefined || payload === null) {
		return { ok: true };
	}

	if (typeof payload !== "object") {
		return { ok: false, error: "Request body must be a JSON object." };
	}

	const body = payload as { serverId?: unknown };
	if (body.serverId === undefined) {
		return { ok: true };
	}

	if (typeof body.serverId !== "string" || !body.serverId.trim()) {
		return { ok: false, error: "serverId must be a non-empty string." };
	}

	return { ok: true, serverId: body.serverId.trim() };
}
