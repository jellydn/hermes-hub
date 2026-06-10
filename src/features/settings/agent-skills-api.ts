import type {
	AgentSkillSummary,
	ManagedManifestEntry,
} from "#shared/contracts/agent-skills";

type AgentSkillResponsePayload = {
	error?: string;
	skill?: AgentSkillSummary;
};

type AgentSkillMutationResult =
	| { ok: true; skill: AgentSkillSummary }
	| { ok: false; error: string };

type RemoteSkillsResponse = {
	raw: string;
	skills: string[];
	count: number;
	managedManifest: ManagedManifestEntry[];
};

type RemoteSkillsResult =
	| { ok: true; data: RemoteSkillsResponse }
	| { ok: false; error: string };

const NETWORK_ERROR =
	"Network error. Please check your connection and try again.";

export async function persistAgentSkill(options: {
	method: "POST" | "PUT";
	url: string;
	body: Record<string, unknown>;
}): Promise<AgentSkillMutationResult> {
	try {
		const response = await fetch(options.url, {
			method: options.method,
			headers: { "content-type": "application/json" },
			body: JSON.stringify(options.body),
		});

		const payload = (await response
			.json()
			.catch(() => null)) as AgentSkillResponsePayload | null;

		if (!response.ok || !payload?.skill) {
			return {
				ok: false,
				error: payload?.error ?? "Unable to save agent skill.",
			};
		}

		return { ok: true, skill: payload.skill };
	} catch {
		return { ok: false, error: NETWORK_ERROR };
	}
}

export async function deleteAgentSkill(
	skillId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const response = await fetch(`/api/settings/agent-skills/${skillId}`, {
			method: "DELETE",
		});

		const payload = (await response.json().catch(() => null)) as {
			error?: string;
		} | null;

		if (!response.ok) {
			return {
				ok: false,
				error: payload?.error ?? "Unable to delete agent skill.",
			};
		}

		return { ok: true };
	} catch {
		return { ok: false, error: NETWORK_ERROR };
	}
}

export async function fetchRemoteSkills(
	serverId: string,
): Promise<RemoteSkillsResult> {
	try {
		const response = await fetch("/api/settings/agent-skills/remote-list", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ serverId }),
		});

		const payload = (await response.json().catch(() => null)) as
			| (RemoteSkillsResponse & { error?: string })
			| null;

		if (!response.ok || !payload) {
			return {
				ok: false,
				error: payload?.error ?? "Unable to fetch remote skills list.",
			};
		}

		// Validate response shape before trusting it
		if (
			typeof payload.raw !== "string" ||
			!Array.isArray(payload.skills) ||
			typeof payload.count !== "number" ||
			!Array.isArray(payload.managedManifest)
		) {
			return {
				ok: false,
				error: "Unexpected response from remote skills endpoint.",
			};
		}

		return {
			ok: true,
			data: {
				raw: payload.raw,
				skills: payload.skills,
				count: payload.count,
				managedManifest: payload.managedManifest,
			},
		};
	} catch {
		return { ok: false, error: NETWORK_ERROR };
	}
}
