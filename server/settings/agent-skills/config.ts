import {
	agentSkillCreateSchema,
	agentSkillUpdateSchema,
	validateCustomContent,
	validateHubInstallRef,
	validateUrlInstallRef,
} from "#shared/contracts/agent-skills";

export type {
	AgentSkillRequest,
	AgentSkillSummary,
	SkillSourceType,
} from "#shared/contracts/agent-skills";
export {
	AGENT_SKILL_NAME_PATTERN,
	agentSkillCreateSchema,
	agentSkillUpdateSchema,
	getHubInstalledName,
	isValidAgentSkillName,
	normalizeSkillInstallRef,
	resolveManifestName,
	SkillSourceTypeSchema,
} from "#shared/contracts/agent-skills";

export function toAgentSkillSummary(record: {
	id: string;
	name: string;
	sourceType: string;
	installRef: string | null;
	content: string | null;
	enabled: boolean;
	createdAt: Date;
	updatedAt: Date;
}): import("#shared/contracts/agent-skills").AgentSkillSummary {
	return {
		id: record.id,
		name: record.name,
		sourceType:
			record.sourceType as import("#shared/contracts/agent-skills").SkillSourceType,
		installRef: record.installRef,
		content: record.content,
		enabled: record.enabled,
		createdAt: record.createdAt.toISOString(),
		updatedAt: record.updatedAt.toISOString(),
	};
}

export function parseAgentSkillCreateBody(payload: unknown):
	| {
			ok: true;
			data: Omit<
				import("#shared/contracts/agent-skills").AgentSkillRequest,
				"id"
			> & {
				name: string;
				sourceType: import("#shared/contracts/agent-skills").SkillSourceType;
			};
	  }
	| { ok: false; error: string } {
	if (!payload || typeof payload !== "object") {
		return { ok: false, error: "Request body must be a JSON object." };
	}

	const parsed = agentSkillCreateSchema.safeParse(payload);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0].message };
	}

	const data = parsed.data;
	return {
		ok: true,
		data: {
			name: data.name,
			sourceType: data.sourceType,
			enabled: data.enabled,
			installRef:
				data.sourceType === "custom"
					? null
					: data.installRef
						? data.installRef.trim()
						: null,
			content:
				data.sourceType === "custom"
					? data.content
						? data.content.trim()
						: null
					: null,
		},
	};
}

export function parseAgentSkillUpdateBody(
	existing: {
		sourceType: import("#shared/contracts/agent-skills").SkillSourceType;
	},
	payload: unknown,
):
	| {
			ok: true;
			data: import("#shared/contracts/agent-skills").AgentSkillRequest;
	  }
	| { ok: false; error: string } {
	if (!payload || typeof payload !== "object") {
		return { ok: false, error: "Request body must be a JSON object." };
	}

	const parsed = agentSkillUpdateSchema.safeParse(payload);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0].message };
	}

	const data = parsed.data;
	const updates: import("#shared/contracts/agent-skills").AgentSkillRequest =
		{};

	if (data.name !== undefined) updates.name = data.name;
	if (data.enabled !== undefined) updates.enabled = data.enabled;

	if (existing.sourceType === "hub") {
		if (data.installRef !== undefined) {
			const error = validateHubInstallRef(data.installRef ?? "");
			if (error) return { ok: false, error };
			updates.installRef = data.installRef?.trim() ?? null;
		}
	} else if (existing.sourceType === "url") {
		if (data.installRef !== undefined) {
			const error = validateUrlInstallRef(data.installRef ?? "");
			if (error) return { ok: false, error };
			updates.installRef = data.installRef?.trim() ?? null;
		}
	} else if (existing.sourceType === "custom") {
		if (data.content !== undefined) {
			const error = validateCustomContent(data.content);
			if (error) return { ok: false, error };
			updates.content = data.content?.trim() ?? null;
		}
	}

	return { ok: true, data: updates };
}

export function parseRemoteSkillsList(stdout: string): {
	skills: string[];
	count: number;
} {
	const skills: string[] = [];

	// Strip header/footer lines (box-drawing borders, title lines, summary lines)
	const lines = stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (lines.length === 0) return { skills: [], count: 0 };

	// Check if this is a table with box-drawing characters
	const hasBoxDrawing = lines.some((line) => /[━─═]/u.test(line));

	if (hasBoxDrawing) {
		// Parse box-drawing table: extract first column from data rows
		for (const line of lines) {
			// Skip border/separator lines and header divider lines
			if (/[━─═┏┳┓┗┻┛┡┧└┘]/u.test(line) || line.startsWith("┃ Name")) {
				continue;
			}
			// Data row: "│ name │ category │ ..."  or "┃ name ┃ category ┃ ..."
			const match = line.match(/^[│┃]\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*[│┃]/);
			if (match?.[1] && !skills.includes(match[1])) {
				skills.push(match[1]);
			}
		}
		return { skills, count: skills.length };
	}

	// Try table header format (space-separated columns with "Name Source Status" style header)
	const hasHeader = lines.some((line) => {
		const lower = line.toLowerCase();
		return (
			lower.includes("name") &&
			(lower.includes("source") ||
				lower.includes("status") ||
				lower.includes("enabled") ||
				lower.includes("category"))
		);
	});

	// Try bullet-list format
	const hasListMarker = lines.some((line) => /^[-*•]\s+/.test(line));

	if (!hasHeader && !hasListMarker) {
		return { skills: [], count: 0 };
	}

	const ignoredLower = new Set([
		"name",
		"source",
		"status",
		"enabled",
		"disabled",
		"installed",
		"skills",
		"category",
		"trust",
	]);

	const namePattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

	for (const line of lines) {
		// Bullet-list item: "- skillname"
		const bulletMatch = line.match(/^[-*•]\s+([a-zA-Z][a-zA-Z0-9_-]*)/);
		if (bulletMatch) {
			const name = bulletMatch[1];
			if (!ignoredLower.has(name.toLowerCase()) && !skills.includes(name)) {
				skills.push(name);
			}
			continue;
		}

		// Space-separated table: first column is the skill name
		if (hasHeader) {
			const parts = line.split(/\s+/);
			if (parts.length >= 2) {
				const first = parts[0];
				if (
					namePattern.test(first) &&
					!ignoredLower.has(first.toLowerCase()) &&
					!skills.includes(first)
				) {
					skills.push(first);
				}
			}
		}
	}

	return { skills, count: skills.length };
}
