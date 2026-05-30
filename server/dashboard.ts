import { desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { formatAiProviderLabel, isAiProviderId } from "../src/lib/ai-providers";
import type {
	DashboardAgentSummary,
	DashboardProviderSummary,
	DashboardServerSummary,
	DashboardStatusSnapshot,
	DashboardTelegramSummary,
	DashboardVpsSummary,
} from "../src/lib/dashboard-status";
import { getAuthSession } from "./auth";
import { getSessionCredential } from "./credentials";
import { decryptSecret } from "./crypto";
import { getDb } from "./db";
import { aiProviders, installs, servers, telegramConfigs } from "./db/schema";
import { readOsInfoValue } from "./server-records";
import { withSshConnection } from "./ssh";

type CacheEntry<T> = {
	data: T;
	timestamp: number;
};

const STATIC_CACHE_TTL_MS = 60_000; // 60 seconds
const METRICS_CACHE_TTL_MS = 15_000; // 15 seconds

const staticCache = new Map<string, CacheEntry<StaticDashboardData>>();
const metricsCache = new Map<string, CacheEntry<ServerMetrics>>();

/** Exposed for tests — clears all cached data between test runs. */
export function clearDashboardCache() {
	staticCache.clear();
	metricsCache.clear();
}

type StaticDashboardData = {
	serverRecord: ServerRecord | null;
	serverCount: number;
	installRecord: InstallRecord | null;
	providerRecord: ProviderRecord | null;
	telegramRecord: TelegramRecord | null;
	staticGeneratedAt: string;
};

type ServerRecord = {
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
};

type InstallRecord = {
	status: string;
	updatedAt: Date;
};

type ProviderRecord = {
	provider: string;
	model: string;
	isActive: boolean;
};

type TelegramRecord = {
	botUsername: string | null;
	isActive: boolean;
};

type ServerMetrics = {
	cpu: number;
	memory: number;
	disk: number;
	uptime: string | null;
};

export async function getDashboardStatus(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const dashboard = await getDashboardStatusSnapshot({
		userId: session.user.id,
		sessionId: session.session.id,
	});

	return context.json({ dashboard });
}

export async function getDashboardStatusSnapshot(input: {
	userId: string;
	sessionId?: string | null;
}): Promise<DashboardStatusSnapshot> {
	const now = Date.now();

	// Check static cache
	const staticCacheKey = `static:${input.userId}`;
	const cachedStatic = staticCache.get(staticCacheKey);

	let serverRecord: ServerRecord | null;
	let serverCount: number;
	let installRecord: InstallRecord | null;
	let providerRecord: ProviderRecord | null;
	let telegramRecord: TelegramRecord | null;
	let staticGeneratedAt: string;

	if (cachedStatic && now - cachedStatic.timestamp < STATIC_CACHE_TTL_MS) {
		serverRecord = cachedStatic.data.serverRecord;
		serverCount = cachedStatic.data.serverCount;
		installRecord = cachedStatic.data.installRecord;
		providerRecord = cachedStatic.data.providerRecord;
		telegramRecord = cachedStatic.data.telegramRecord;
		staticGeneratedAt = cachedStatic.data.staticGeneratedAt;
	} else {
		const results = await Promise.all([
			getLatestServer(input.userId),
			getServerCount(input.userId),
			getLatestProvider(input.userId),
			getLatestTelegram(input.userId),
		]);

		serverRecord = results[0];
		serverCount = results[1];
		providerRecord = results[2];
		telegramRecord = results[3];
		installRecord = serverRecord
			? await getLatestInstall(serverRecord.id)
			: null;
		staticGeneratedAt = new Date().toISOString();

		staticCache.set(staticCacheKey, {
			data: {
				serverRecord,
				serverCount,
				installRecord,
				providerRecord,
				telegramRecord,
				staticGeneratedAt,
			},
			timestamp: now,
		});
	}

	const serverSummary = serverRecord ? toServerSummary(serverRecord) : null;

	return {
		generatedAt: new Date().toISOString(),
		server: serverSummary,
		serverCount,
		agent: toAgentSummary(serverRecord, installRecord),
		vps: await getVpsSummary(serverRecord, input.sessionId),
		provider: toProviderSummary(providerRecord),
		telegram: toTelegramSummary(telegramRecord),
	};
}

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
	providerRecord: ProviderRecord | null,
): DashboardProviderSummary {
	if (!providerRecord?.isActive || !isAiProviderId(providerRecord.provider)) {
		return {
			status: "disconnected",
			provider: null,
			model: null,
			detail: "No AI provider connected yet.",
		};
	}

	return {
		status: "connected",
		provider: providerRecord.provider,
		model: providerRecord.model,
		detail: `${formatAiProviderLabel(providerRecord.provider)} is ready to power Hermes responses.`,
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

export function getHealthTone(
	metrics: Pick<ServerMetrics, "cpu" | "memory" | "disk">,
) {
	return metrics.cpu >= 85 || metrics.memory >= 85 || metrics.disk >= 85
		? "warning"
		: "healthy";
}

async function getVpsSummary(
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
		const credential = getServerCredential(serverRecord, sessionId);
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

async function getLatestServer(userId: string) {
	const [serverRecord] = await getDb()
		.select({
			id: servers.id,
			label: servers.label,
			host: servers.host,
			port: servers.port,
			username: servers.username,
			authMethod: servers.authMethod,
			encryptedCredential: servers.encryptedCredential,
			storeCredential: servers.storeCredential,
			status: servers.status,
			osInfo: servers.osInfo,
			updatedAt: servers.updatedAt,
		})
		.from(servers)
		.where(eq(servers.userId, userId))
		.orderBy(desc(servers.createdAt))
		.limit(1);

	return (serverRecord as ServerRecord | undefined) ?? null;
}

async function getServerCount(userId: string) {
	const records = await getDb()
		.select({ id: servers.id })
		.from(servers)
		.where(eq(servers.userId, userId))
		.orderBy(desc(servers.createdAt));

	return records.length;
}

async function getLatestInstall(serverId: string) {
	const [installRecord] = await getDb()
		.select({
			status: installs.status,
			updatedAt: installs.updatedAt,
		})
		.from(installs)
		.where(eq(installs.serverId, serverId))
		.orderBy(desc(installs.createdAt))
		.limit(1);

	return installRecord ?? null;
}

async function getLatestProvider(userId: string) {
	const [providerRecord] = await getDb()
		.select({
			provider: aiProviders.provider,
			model: aiProviders.model,
			isActive: aiProviders.isActive,
		})
		.from(aiProviders)
		.where(eq(aiProviders.userId, userId))
		.orderBy(desc(aiProviders.createdAt))
		.limit(1);

	return providerRecord ?? null;
}

async function getLatestTelegram(userId: string) {
	const [telegramRecord] = await getDb()
		.select({
			botUsername: telegramConfigs.botUsername,
			isActive: telegramConfigs.isActive,
		})
		.from(telegramConfigs)
		.where(eq(telegramConfigs.userId, userId))
		.orderBy(desc(telegramConfigs.createdAt))
		.limit(1);

	return telegramRecord ?? null;
}

function toServerSummary(serverRecord: ServerRecord): DashboardServerSummary {
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

function getServerCredential(
	serverRecord: Pick<
		ServerRecord,
		"id" | "encryptedCredential" | "storeCredential"
	>,
	sessionId?: string | null,
) {
	if (serverRecord.storeCredential) {
		if (!serverRecord.encryptedCredential) {
			throw new Error("Stored credential is missing.");
		}

		return decryptSecret(serverRecord.encryptedCredential);
	}

	if (!sessionId) {
		throw new Error(
			"Temporary credential expired. Reconnect the server first.",
		);
	}

	const ephemeralCredential = getSessionCredential(serverRecord.id, sessionId);
	if (!ephemeralCredential) {
		throw new Error(
			"Temporary credential expired. Reconnect the server first.",
		);
	}

	return ephemeralCredential.credential;
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
		},
		async (ssh) => {
			const [cpuResult, memoryResult, diskResult, uptimeResult] =
				await Promise.all([
					ssh.execCommand(
						'LANG=C top -bn1 | awk \'/^%Cpu|^Cpu/ {for (i=1; i<=NF; i++) gsub(/[^0-9.]/, "", $i); printf "%.0f", $2 + $4; exit}\'',
					),
					ssh.execCommand("free | awk '/Mem:/ {printf \"%.0f\", ($3/$2)*100}'"),
					ssh.execCommand(
						'df -P / | awk \'NR==2 {gsub("%", "", $5); printf "%s", $5}\'',
					),
					ssh.execCommand("uptime -p"),
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

function parsePercentValue(value: string) {
	const parsed = Number.parseInt(value.trim(), 10);
	if (Number.isNaN(parsed)) {
		return null;
	}

	return Math.max(0, Math.min(100, parsed));
}

function normalizeAuthMethod(authMethod: string) {
	if (authMethod === "password" || authMethod === "ssh-key") {
		return authMethod;
	}

	return null;
}
