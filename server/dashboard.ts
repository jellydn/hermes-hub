import type { Context } from "hono";
import type { DashboardStatusSnapshot } from "#/lib/dashboard-status";
import { getAuthSession } from "./auth";
import { clearMetricsCache, getVpsSummary } from "./dashboard/metrics";
import {
	getLatestInstall,
	getLatestProvider,
	getLatestServer,
	getLatestTelegram,
	getServerCount,
} from "./dashboard/records";
import {
	type InstallRecord,
	type ServerRecord,
	type TelegramRecord,
	toAgentSummary,
	toProviderSummary,
	toServerSummary,
	toTelegramSummary,
} from "./dashboard/summaries";
import type { ActiveModelBackend } from "./providers/active-backend";

// Re-exports for tests and route files
export {
	getHealthTone,
	toAgentSummary,
	toProviderSummary,
	toTelegramSummary,
} from "./dashboard/summaries";

type CacheEntry<T> = {
	data: T;
	timestamp: number;
};

const STATIC_CACHE_TTL_MS = 60_000; // 60 seconds

const staticCache = new Map<string, CacheEntry<StaticDashboardData>>();

type StaticDashboardData = {
	serverRecord: ServerRecord | null;
	serverCount: number;
	installRecord: InstallRecord | null;
	activeBackend: ActiveModelBackend | null;
	telegramRecord: TelegramRecord | null;
	staticGeneratedAt: string;
};

/** Clears all cached dashboard data between test runs / after mutations. */
export function clearDashboardCache() {
	staticCache.clear();
	clearMetricsCache();
}

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
	let activeBackend: ActiveModelBackend | null;
	let telegramRecord: TelegramRecord | null;
	let staticGeneratedAt: string;

	if (cachedStatic && now - cachedStatic.timestamp < STATIC_CACHE_TTL_MS) {
		serverRecord = cachedStatic.data.serverRecord;
		serverCount = cachedStatic.data.serverCount;
		installRecord = cachedStatic.data.installRecord;
		activeBackend = cachedStatic.data.activeBackend;
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
		activeBackend = results[2];
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
				activeBackend,
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
		provider: toProviderSummary(activeBackend),
		telegram: toTelegramSummary(telegramRecord),
	};
}
