import type { McpServerSummary } from "../../../server/settings/mcp/config";

import type { buildRequestBody } from "./mcp-form-state";

type McpServerResponsePayload = {
	error?: string;
	server?: McpServerSummary;
};

type McpMutationResult =
	| { ok: true; server: McpServerSummary }
	| { ok: false; error: string };

const NETWORK_ERROR =
	"Network error. Please check your connection and try again.";

export async function persistMcpServer(options: {
	method: "POST" | "PUT";
	url: string;
	body: ReturnType<typeof buildRequestBody>;
}): Promise<McpMutationResult> {
	try {
		const response = await fetch(options.url, {
			method: options.method,
			headers: { "content-type": "application/json" },
			body: JSON.stringify(options.body),
		});

		const payload = (await response
			.json()
			.catch(() => null)) as McpServerResponsePayload | null;

		if (!response.ok || !payload?.server) {
			return {
				ok: false,
				error: payload?.error ?? "Unable to save MCP server.",
			};
		}

		return { ok: true, server: payload.server };
	} catch {
		return { ok: false, error: NETWORK_ERROR };
	}
}

export async function deleteMcpServer(
	serverId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const response = await fetch(`/api/settings/mcp-servers/${serverId}`, {
			method: "DELETE",
		});

		const payload = (await response.json().catch(() => null)) as {
			error?: string;
		} | null;

		if (!response.ok) {
			return {
				ok: false,
				error: payload?.error ?? "Unable to delete MCP server.",
			};
		}

		return { ok: true };
	} catch {
		return { ok: false, error: NETWORK_ERROR };
	}
}
