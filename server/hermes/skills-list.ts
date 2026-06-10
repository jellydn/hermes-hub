/**
 * Parse `hermes skills list` CLI stdout into installed skill names.
 */
export function parseRemoteSkillsList(stdout: string): {
	skills: string[];
	count: number;
} {
	const skills: string[] = [];

	const lines = stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (lines.length === 0) return { skills: [], count: 0 };

	const hasBoxDrawing = lines.some((line) => /[━─═]/u.test(line));

	if (hasBoxDrawing) {
		for (const line of lines) {
			if (/[━─═┏┳┓┗┻┛┡┧└┘]/u.test(line) || line.startsWith("┃ Name")) {
				continue;
			}
			const match = line.match(/^[│┃]\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*[│┃]/);
			if (match?.[1] && !skills.includes(match[1])) {
				skills.push(match[1]);
			}
		}
		return { skills, count: skills.length };
	}

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
		const bulletMatch = line.match(/^[-*•]\s+([a-zA-Z][a-zA-Z0-9_-]*)/);
		if (bulletMatch) {
			const name = bulletMatch[1];
			if (!ignoredLower.has(name.toLowerCase()) && !skills.includes(name)) {
				skills.push(name);
			}
			continue;
		}

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
