export function buildLogLinesFromEvents(
	events: Array<{ step: string; message: string; createdAt: Date }>,
): string[] {
	return events.map(
		(event) =>
			`${event.createdAt.toISOString()} [${event.step}] ${event.message}`,
	);
}
