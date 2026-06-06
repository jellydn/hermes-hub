export type InstallStatus = "pending" | "running" | "succeeded" | "failed";

export type InstallEvent = {
	installId: string;
	serverId: string;
	step: string;
	progress: number;
	message: string;
	status: InstallStatus;
	timestamp: string;
	error?: string;
};

type InstallSnapshot = {
	events: InstallEvent[];
	status: InstallStatus;
	error: string | null;
};

function getInstallEventKey(event: InstallEvent) {
	return [event.installId, event.timestamp, event.step, event.message].join(
		":",
	);
}

export function mergeInstallSnapshot(
	current: InstallSnapshot,
	nextEvent: InstallEvent,
) {
	const hasEvent = current.events.some(
		(event) => getInstallEventKey(event) === getInstallEventKey(nextEvent),
	);

	const nextEvents = hasEvent ? current.events : [...current.events, nextEvent];

	return {
		events: nextEvents,
		status: nextEvent.status,
		error:
			nextEvent.error ??
			(nextEvent.status === "failed" ? nextEvent.message : null),
	};
}

export function quantizeInstallProgress(progress: number) {
	if (progress <= 0) {
		return 0;
	}

	return Math.min(100, Math.ceil(progress / 25) * 25);
}

export function formatInstallTimestamp(timestamp: string) {
	const parsed = new Date(timestamp);

	if (Number.isNaN(parsed.getTime())) {
		return timestamp;
	}

	return parsed.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}
