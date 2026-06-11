import type {
	DashboardAgentSummary,
	DashboardProviderSummary,
	DashboardServerSummary,
	DashboardTelegramSummary,
} from "#/lib/dashboard-status";
import {
	type ActiveModelBackend,
	formatActiveBackendLabel,
} from "../providers/active-backend";
import { readOsInfoValue } from "../server-records";

export type ServerRecord = {
	id: string;
	label: string;
	host: string;
	port: number;
	username: string;
	authMethod: string;
	encryptedCredential: string | null;
	storeCredential: boolean;
	status: string;
	osInfo: Record<string, unknown>;
	updatedAt: Date;
	hostKeyFingerprint: string | null;
};

export type InstallRecord = {
	status: string;
	updatedAt: Date;
};

export type TelegramRecord = {
	botUsername: string | null;
	isActive: boolean;
};

export type ServerMetrics = {
	cpu: number;
	memory: number;
	disk: number;
	uptime: string | null;
};

export function toAgentSummary(
	serverRecord: Pick<ServerRecord, "status"> | null,
	installRecord: InstallRecord | null,
): DashboardAgentSummary {
	if (!serverRecord) {
		return {
			status: "offline",
			updatedAt: null,
			detail:
				"Connect a VPS first so HermesHub can install and monitor your agent.",
		};
	}

	if (
		installRecord?.status === "succeeded" &&
		serverRecord.status === "connected"
	) {
		return {
			status: "online",
			updatedAt: installRecord.updatedAt.toISOString(),
			detail: "Hermes finished installing successfully on the connected VPS.",
		};
	}

	if (
		installRecord?.status === "running" ||
		installRecord?.status === "pending"
	) {
		return {
			status: "offline",
			updatedAt: installRecord.updatedAt.toISOString(),
			detail:
				"Hermes is still being installed. Check the latest install activity for progress.",
		};
	}

	if (installRecord?.status === "failed") {
		return {
			status: "offline",
			updatedAt: installRecord.updatedAt.toISOString(),
			detail:
				"The most recent Hermes install failed. Retry the install after fixing the VPS issue.",
		};
	}

	return {
		status: "offline",
		updatedAt: serverRecord.status ? new Date().toISOString() : null,
		detail: "The VPS is connected, but Hermes has not finished installing yet.",
	};
}

export function toProviderSummary(
	activeBackend: ActiveModelBackend | null,
): DashboardProviderSummary {
	if (!activeBackend) {
		return {
			status: "disconnected",
			provider: null,
			model: null,
			detail: "No AI provider connected yet.",
		};
	}

	return {
		status: "connected",
		provider:
			activeBackend.kind === "subscription"
				? activeBackend.subscriptionProvider
				: activeBackend.provider,
		model: activeBackend.model,
		detail: `${formatActiveBackendLabel(
			activeBackend,
		)} is ready to power Hermes responses.`,
	};
}

export function toTelegramSummary(
	telegramRecord: TelegramRecord | null,
): DashboardTelegramSummary {
	if (!telegramRecord?.isActive || !telegramRecord.botUsername) {
		return {
			status: "disconnected",
			botUsername: null,
			detail: "No Telegram bot connected yet.",
		};
	}

	return {
		status: "connected",
		botUsername: telegramRecord.botUsername,
		detail: `@${telegramRecord.botUsername} is ready for chat delivery.`,
	};
}

export const RESOURCE_WARNING_THRESHOLD = 85;
export const RESOURCE_CRITICAL_THRESHOLD = 95;

export type ResourceHealthStatus = "healthy" | "warning" | "critical";

export function getResourceHealthStatus(percent: number): ResourceHealthStatus {
	if (percent >= RESOURCE_CRITICAL_THRESHOLD) {
		return "critical";
	}

	if (percent >= RESOURCE_WARNING_THRESHOLD) {
		return "warning";
	}

	return "healthy";
}

export function getHealthTone(
	metrics: Pick<ServerMetrics, "cpu" | "memory" | "disk">,
) {
	const statuses = [
		getResourceHealthStatus(metrics.cpu),
		getResourceHealthStatus(metrics.memory),
		getResourceHealthStatus(metrics.disk),
	];

	return statuses.some(
		(status) => status === "warning" || status === "critical",
	)
		? "warning"
		: "healthy";
}

export function toServerSummary(
	serverRecord: ServerRecord,
): DashboardServerSummary {
	const osName = readOsInfoValue(serverRecord.osInfo, "name");
	const osVersion = readOsInfoValue(serverRecord.osInfo, "version");
	const supportLevel = readOsInfoValue(
		serverRecord.osInfo,
		"supportLevel",
	) as DashboardServerSummary["supportLevel"];

	return {
		id: serverRecord.id,
		label: serverRecord.label,
		host: serverRecord.host,
		status: serverRecord.status,
		osName,
		osVersion,
		supportLevel,
	};
}

export function parsePercentValue(value: string) {
	const parsed = Number.parseInt(value.trim(), 10);
	if (Number.isNaN(parsed)) {
		return null;
	}

	return Math.max(0, Math.min(100, parsed));
}
