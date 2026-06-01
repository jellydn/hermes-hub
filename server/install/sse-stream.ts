import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { installEvents, installs } from "../db/schema";

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

export type InstallStreamState = {
	installId: string;
	serverId: string;
	events: InstallEvent[];
	listeners: Set<(event: InstallEvent) => void>;
	status: InstallStatus;
	runId: string;
};

export const IDLE_TIMEOUT_MS = 90_000;
export const HEARTBEAT_INTERVAL_MS = 30_000;

export const installStreams = new Map<string, InstallStreamState>();

export function normalizeInstallStatus(status?: string | null): InstallStatus {
	if (
		status === "pending" ||
		status === "running" ||
		status === "succeeded" ||
		status === "failed"
	) {
		return status;
	}

	return "pending";
}

export async function hydrateInstallEvents(
	serverId: string,
	installRecord: {
		id: string;
		status: string;
		step: string;
		log: string | null;
	},
) {
	const events = await getDb()
		.select({
			installId: installEvents.installId,
			step: installEvents.step,
			progress: installEvents.progress,
			message: installEvents.message,
			status: installEvents.status,
			timestamp: installEvents.createdAt,
			error: installEvents.error,
		})
		.from(installEvents)
		.where(eq(installEvents.installId, installRecord.id))
		.orderBy(installEvents.createdAt);

	if (events.length > 0) {
		return events.map((event) => ({
			installId: event.installId,
			serverId,
			step: event.step,
			progress: event.progress,
			message: event.message,
			status: normalizeInstallStatus(event.status),
			timestamp: event.timestamp.toISOString(),
			...(event.error ? { error: event.error } : {}),
		}));
	}

	// Fallback: parse legacy log blob for backward compatibility during transition.
	if (!installRecord.log) {
		return [];
	}

	const lines = installRecord.log.split("\n").filter(Boolean);
	if (lines.length === 0) {
		return [];
	}

	return lines.map((line, index) => {
		const timestamp = line.slice(0, 24);
		const stepMatch = line.match(/\[(.+?)\]/);
		const messageIndex = line.indexOf("] ");

		return {
			installId: installRecord.id,
			serverId,
			step: stepMatch?.[1] ?? installRecord.step,
			progress: Math.round(((index + 1) / lines.length) * 100),
			message: messageIndex >= 0 ? line.slice(messageIndex + 2) : line,
			status: normalizeInstallStatus(installRecord.status),
			timestamp,
		};
	});
}

export function resetInstallStream(serverId: string, installId: string) {
	const state: InstallStreamState = {
		installId,
		serverId,
		events: [],
		listeners: new Set(),
		status: "pending",
		runId: randomUUID(),
	};

	installStreams.set(serverId, state);
	return state;
}

/**
 * Atomically claims the in-process install slot for `serverId`. Returns the
 * placeholder state on success, or `null` if an install is already running.
 * The caller must populate `installId` once the DB row exists and release
 * the slot (`releaseInstallStream`) if subsequent setup fails.
 */
export function tryClaimInstallStream(
	serverId: string,
): InstallStreamState | null {
	const existing = installStreams.get(serverId);
	if (existing?.status === "running" || existing?.status === "pending") {
		return null;
	}

	const state: InstallStreamState = {
		installId: "",
		serverId,
		events: [],
		listeners: new Set(),
		status: "pending",
		runId: randomUUID(),
	};
	installStreams.set(serverId, state);
	return state;
}

export function releaseInstallStream(serverId: string, runId: string) {
	const existing = installStreams.get(serverId);
	if (existing?.runId === runId) {
		installStreams.delete(serverId);
	}
}

export async function ensureInstallStream(serverId: string) {
	const existing = installStreams.get(serverId);
	if (existing) {
		return existing;
	}

	const [installRecord] = await getDb()
		.select({
			id: installs.id,
			status: installs.status,
			step: installs.step,
			log: installs.log,
		})
		.from(installs)
		.where(eq(installs.serverId, serverId))
		.orderBy(desc(installs.createdAt))
		.limit(1);

	const state: InstallStreamState = {
		installId: installRecord?.id ?? randomUUID(),
		serverId,
		events: installRecord
			? await hydrateInstallEvents(serverId, installRecord)
			: [],
		listeners: new Set(),
		status: normalizeInstallStatus(installRecord?.status),
		runId: randomUUID(),
	};

	installStreams.set(serverId, state);
	return state;
}

export async function emitInstallEvent(input: {
	installId: string;
	serverId: string;
	runId: string;
	step: string;
	progress: number;
	message: string;
	status: InstallStatus;
	error?: string;
	logLines: string[];
}) {
	const state = installStreams.get(input.serverId);
	if (!state || state.runId !== input.runId) {
		return;
	}

	const timestamp = new Date().toISOString();
	const logLine = `${timestamp} [${input.step}] ${
		input.error ? `${input.message}: ${input.error}` : input.message
	}`;
	input.logLines.push(logLine);

	const event: InstallEvent = {
		installId: input.installId,
		serverId: input.serverId,
		step: input.step,
		progress: input.progress,
		message: input.message,
		status: input.status,
		timestamp,
		...(input.error ? { error: input.error } : {}),
	};

	state.events.push(event);
	state.status = input.status;

	await getDb()
		.insert(installEvents)
		.values({
			installId: input.installId,
			step: input.step,
			progress: input.progress,
			message: input.message,
			status: input.status,
			...(input.error ? { error: input.error } : {}),
		});

	await getDb()
		.update(installs)
		.set({
			status: input.status,
			step: input.step,
			log: input.logLines.join("\n"),
			version: "latest",
			updatedAt: new Date(),
		})
		.where(eq(installs.id, input.installId));

	for (const listener of state.listeners) {
		listener(event);
	}
}
