import type { DashboardVpsSummary } from "#/lib/dashboard-status";
import {
	normalizeAuthMethod,
	resolveServerCredential,
} from "../server-records";
import { withSshConnection } from "../ssh";
import { SERVER_METRIC_COMMANDS } from "../ssh/metrics-commands";
import {
	getHealthTone,
	parsePercentValue,
	type ServerMetrics,
	type ServerRecord,
} from "./summaries";

type CacheEntry<T> = {
	data: T;
	timestamp: number;
};

const METRICS_CACHE_TTL_MS = 15_000; // 15 seconds

const metricsCache = new Map<string, CacheEntry<ServerMetrics>>();

export function clearMetricsCache() {
	metricsCache.clear();
}

export async function getVpsSummary(
	serverRecord: ServerRecord | null,
	sessionId?: string | null,
): Promise<DashboardVpsSummary> {
	if (!serverRecord) {
		return {
			status: "disconnected",
			updatedAt: null,
			cpu: null,
			memory: null,
			disk: null,
			uptime: null,
			detail: "Connect your first VPS to unlock live health metrics.",
			error: null,
		};
	}

	if (serverRecord.status !== "connected") {
		return {
			status: "disconnected",
			updatedAt: serverRecord.updatedAt.toISOString(),
			cpu: null,
			memory: null,
			disk: null,
			uptime: null,
			detail: "The latest VPS record is not in a connected state.",
			error: null,
		};
	}

	const metricsCacheKey = `metrics:${serverRecord.id}`;
	const now = Date.now();
	const cachedMetrics = metricsCache.get(metricsCacheKey);

	if (cachedMetrics && now - cachedMetrics.timestamp < METRICS_CACHE_TTL_MS) {
		const metrics = cachedMetrics.data;
		const status = getHealthTone(metrics);

		return {
			status,
			updatedAt: new Date(now).toISOString(),
			cpu: metrics.cpu,
			memory: metrics.memory,
			disk: metrics.disk,
			uptime: metrics.uptime,
			detail:
				status === "warning"
					? "One or more VPS resources are running hot."
					: "The connected VPS is responding to live health checks.",
			error: null,
		};
	}

	try {
		const credential = resolveServerCredential(serverRecord, sessionId);
		const metrics = await readServerMetrics(serverRecord, credential);
		const status = getHealthTone(metrics);

		metricsCache.set(metricsCacheKey, {
			data: metrics,
			timestamp: now,
		});

		return {
			status,
			updatedAt: new Date().toISOString(),
			cpu: metrics.cpu,
			memory: metrics.memory,
			disk: metrics.disk,
			uptime: metrics.uptime,
			detail:
				status === "warning"
					? "One or more VPS resources are running hot."
					: "The connected VPS is responding to live health checks.",
			error: null,
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unable to read VPS metrics.";

		return {
			status: "error",
			updatedAt: new Date().toISOString(),
			cpu: null,
			memory: null,
			disk: null,
			uptime: null,
			detail: "HermesHub could not fetch live VPS health right now.",
			error: message,
		};
	}
}

async function readServerMetrics(
	serverRecord: ServerRecord,
	credential: string,
) {
	const authMethod = normalizeAuthMethod(serverRecord.authMethod);
	if (!authMethod) {
		throw new Error("Unsupported authentication method.");
	}

	return withSshConnection(
		{
			host: serverRecord.host,
			port: serverRecord.port,
			username: serverRecord.username,
			authMethod,
			credential,
			expectedFingerprint: serverRecord.hostKeyFingerprint ?? undefined,
			requireHostKeyPin: true,
		},
		async (ssh) => {
			const [cpuResult, memoryResult, diskResult, uptimeResult] =
				await Promise.all([
					ssh.execCommand(SERVER_METRIC_COMMANDS.cpu),
					ssh.execCommand(SERVER_METRIC_COMMANDS.memory),
					ssh.execCommand(SERVER_METRIC_COMMANDS.disk),
					ssh.execCommand(SERVER_METRIC_COMMANDS.uptime),
				]);

			const cpu = parsePercentValue(cpuResult.stdout);
			const memory = parsePercentValue(memoryResult.stdout);
			const disk = parsePercentValue(diskResult.stdout);

			if (cpu === null || memory === null || disk === null) {
				throw new Error("Live VPS metrics returned an unexpected format.");
			}

			return {
				cpu,
				memory,
				disk,
				uptime: uptimeResult.stdout.trim() || null,
			};
		},
	);
}
