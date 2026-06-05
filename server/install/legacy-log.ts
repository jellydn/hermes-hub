export function parseLegacyLogBlob(
	blob: string | null,
	fallbackTimestamp: Date,
): string[] {
	if (!blob) {
		return [];
	}

	const lines = blob
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	if (lines.length === 0) {
		return [];
	}

	const timestamp = fallbackTimestamp.toISOString();
	return lines.map((line) => `${timestamp} [legacy] ${line}`);
}

/**
 * Derives log lines from either standard structured events or falls back
 * to the legacy log blob.
 *
 * TODO: Drop legacyLog fallback and parseLegacyLogBlob once database migration
 * has successfully backfilled all old records into the install_events table.
 */
export function buildLogLinesFromEvents(
	events: Array<{ step: string; message: string; createdAt: Date }>,
	legacyLog: string | null,
	createdAt: Date,
): string[] {
	if (events.length > 0) {
		return events.map(
			(event) =>
				`${event.createdAt.toISOString()} [${event.step}] ${event.message}`,
		);
	}
	return parseLegacyLogBlob(legacyLog, createdAt);
}
