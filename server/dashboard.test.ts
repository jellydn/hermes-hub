import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	getAuthSession,
	getSessionCredential,
	decryptSecret,
	withSshConnection,
	resolveActiveModelBackend,
	dbSelect,
	selectFrom,
	selectWhere,
	selectOrderBy,
	selectLimit,
} = vi.hoisted(() => ({
	getAuthSession: vi.fn(),
	getSessionCredential: vi.fn(),
	decryptSecret: vi.fn(),
	withSshConnection: vi.fn(),
	resolveActiveModelBackend: vi.fn(),
	dbSelect: vi.fn(),
	selectFrom: vi.fn(),
	selectWhere: vi.fn(),
	selectOrderBy: vi.fn(),
	selectLimit: vi.fn(),
}));

vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./credentials", () => ({
	getSessionCredential,
}));

vi.mock("./crypto", () => ({
	decryptSecret,
}));

vi.mock("./ssh", () => ({
	withSshConnection,
}));

vi.mock("./db", () => ({
	getDb: () => ({
		select: dbSelect,
	}),
}));

vi.mock("./providers/model-access", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("./providers/model-access")>();
	return {
		...actual,
		resolveActiveModelBackend,
	};
});

import {
	clearDashboardCache,
	getDashboardStatusSnapshot,
	getHealthTone,
	toAgentSummary,
	toProviderSummary,
	toTelegramSummary,
} from "./dashboard";

function mockDashboardServerCount(count: number) {
	selectOrderBy.mockReset();
	selectOrderBy
		.mockReturnValueOnce({ limit: selectLimit })
		.mockReturnValue({ limit: selectLimit });

	// getServerCount now uses COUNT(*) without orderBy/limit,
	// so inject the count into the selectWhere return for the 2nd call
	selectWhere
		.mockReturnValueOnce(
			Object.assign([], { orderBy: selectOrderBy, limit: selectLimit }),
		)
		.mockReturnValueOnce(
			Object.assign([{ count }], {
				orderBy: selectOrderBy,
				limit: selectLimit,
			}),
		);
}

describe("dashboard helpers", () => {
	it("marks the agent online only after a successful install", () => {
		const summary = toAgentSummary(
			{ status: "connected" },
			{ status: "succeeded", updatedAt: new Date("2026-05-26T03:00:00.000Z") },
		);

		expect(summary.status).toBe("online");
		expect(summary.updatedAt).toBe("2026-05-26T03:00:00.000Z");
	});

	it("marks resource pressure as warning when any metric is high", () => {
		expect(getHealthTone({ cpu: 91, memory: 42, disk: 55 })).toBe("warning");
		expect(getHealthTone({ cpu: 97, memory: 42, disk: 55 })).toBe("warning");
		expect(getHealthTone({ cpu: 24, memory: 42, disk: 55 })).toBe("healthy");
	});

	it("formats connected provider and Telegram summaries", () => {
		expect(
			toProviderSummary({
				kind: "api-provider",
				provider: "openai",
				model: "gpt-4o-mini",
				encryptedApiKey: "encrypted-key",
				baseUrl: null,
			}),
		).toMatchObject({
			status: "connected",
			provider: "openai",
			model: "gpt-4o-mini",
		});

		expect(
			toTelegramSummary({
				botUsername: "hermes_helper_bot",
				isActive: true,
			}),
		).toMatchObject({
			status: "connected",
			botUsername: "hermes_helper_bot",
		});
	});

	it("reports agent offline when no install record exists", () => {
		const summary = toAgentSummary({ status: "connected" }, null);
		expect(summary.status).toBe("offline");
		expect(summary.detail).toContain("not finished installing");
	});

	it("reports agent offline when install is still running", () => {
		const summary = toAgentSummary(
			{ status: "connected" },
			{ status: "running", updatedAt: new Date() },
		);
		expect(summary.status).toBe("offline");
		expect(summary.detail).toContain("still being installed");
	});

	it("reports agent offline when install failed", () => {
		const summary = toAgentSummary(
			{ status: "connected" },
			{ status: "failed", updatedAt: new Date() },
		);
		expect(summary.status).toBe("offline");
		expect(summary.detail).toContain("install failed");
	});

	it("reports provider disconnected when record is null", () => {
		expect(toProviderSummary(null)).toMatchObject({
			status: "disconnected",
			provider: null,
		});
	});

	it("reports provider disconnected when no active backend exists", () => {
		expect(toProviderSummary(null)).toMatchObject({
			status: "disconnected",
		});
	});

	it("reports Telegram disconnected when botUsername is null", () => {
		expect(
			toTelegramSummary({ botUsername: null, isActive: true }),
		).toMatchObject({
			status: "disconnected",
		});
	});
});

describe("dashboard snapshot integration", () => {
	const now = new Date("2026-05-26T12:00:00.000Z");

	beforeEach(() => {
		vi.clearAllMocks();
		vi.setSystemTime(now);
		clearDashboardCache();

		getAuthSession.mockResolvedValue({
			session: { id: "session_123" },
			user: { id: "user_123", email: "test@example.com" },
		});

		dbSelect.mockReturnValue({ from: selectFrom });
		selectFrom.mockReturnValue({ where: selectWhere });
		selectWhere.mockReturnValue(
			Object.assign([], { orderBy: selectOrderBy, limit: selectLimit }),
		);
		selectOrderBy.mockReturnValue({ limit: selectLimit });

		// reset to clear stale _onceImpl chains from prior tests
		selectLimit.mockReset();
		resolveActiveModelBackend.mockResolvedValue(null);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("builds a full dashboard snapshot with server, install, provider, telegram, and VPS metrics", async () => {
		mockDashboardServerCount(1);
		resolveActiveModelBackend.mockResolvedValueOnce({
			kind: "api-provider",
			provider: "anthropic",
			model: "claude-sonnet-4-20250514",
			encryptedApiKey: "encrypted-key",
			baseUrl: null,
		});
		selectLimit
			// getLatestServer
			.mockResolvedValueOnce([
				{
					id: "server_123",
					label: "Prod VPS",
					host: "203.0.113.10",
					port: 22,
					username: "root",
					authMethod: "password",
					encryptedCredential: "encrypted-secret",
					storeCredential: true,
					status: "connected",
					osInfo: { name: "Ubuntu", version: "24.04" },
					updatedAt: now,
				},
			])
			// getLatestTelegram
			.mockResolvedValueOnce([{ botUsername: "hermes_bot", isActive: true }])
			// getLatestInstall
			.mockResolvedValueOnce([{ status: "succeeded", updatedAt: now }]);

		decryptSecret.mockReturnValue("ssh-key-secret");
		withSshConnection.mockImplementation(async (_config, run) => {
			const execCommand = vi
				.fn()
				.mockResolvedValueOnce({ code: 0, stdout: "23", stderr: "" })
				.mockResolvedValueOnce({ code: 0, stdout: "45", stderr: "" })
				.mockResolvedValueOnce({ code: 0, stdout: "67", stderr: "" })
				.mockResolvedValueOnce({ code: 0, stdout: "up 3 days", stderr: "" });
			return run({ execCommand });
		});

		const snapshot = await getDashboardStatusSnapshot({
			userId: "user_123",
			sessionId: "session_123",
		});

		expect(snapshot.server).toMatchObject({
			id: "server_123",
			label: "Prod VPS",
			host: "203.0.113.10",
			osName: "Ubuntu",
			osVersion: "24.04",
		});
		expect(snapshot.serverCount).toBe(1);

		expect(snapshot.agent).toMatchObject({
			status: "online",
		});

		expect(snapshot.vps).toMatchObject({
			status: "healthy",
			cpu: 23,
			memory: 45,
			disk: 67,
			uptime: "up 3 days",
			error: null,
		});

		expect(snapshot.provider).toMatchObject({
			status: "connected",
			provider: "anthropic",
			model: "claude-sonnet-4-20250514",
		});

		expect(snapshot.telegram).toMatchObject({
			status: "connected",
			botUsername: "hermes_bot",
		});
	});

	it("returns empty summaries when no server exists", async () => {
		mockDashboardServerCount(0);
		selectLimit.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

		const snapshot = await getDashboardStatusSnapshot({
			userId: "user_123",
			sessionId: "session_123",
		});

		expect(snapshot.server).toBeNull();
		expect(snapshot.serverCount).toBe(0);
		expect(snapshot.agent).toMatchObject({ status: "offline" });
		expect(snapshot.vps).toMatchObject({ status: "disconnected" });
		expect(snapshot.provider).toMatchObject({ status: "disconnected" });
		expect(snapshot.telegram).toMatchObject({ status: "disconnected" });
		expect(withSshConnection).not.toHaveBeenCalled();
	});

	it("returns VPS error summary when SSH metrics fail", async () => {
		mockDashboardServerCount(1);
		selectLimit
			.mockResolvedValueOnce([
				{
					id: "server_123",
					label: "Prod VPS",
					host: "203.0.113.10",
					port: 22,
					username: "root",
					authMethod: "password",
					encryptedCredential: "encrypted-secret",
					storeCredential: true,
					status: "connected",
					osInfo: {},
					updatedAt: now,
				},
			])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);

		decryptSecret.mockReturnValue("ssh-key-secret");
		withSshConnection.mockRejectedValue(new Error("Connection reset by peer"));

		const snapshot = await getDashboardStatusSnapshot({
			userId: "user_123",
			sessionId: "session_123",
		});

		expect(snapshot.vps).toMatchObject({
			status: "error",
			cpu: null,
			memory: null,
			disk: null,
			error: "Connection reset by peer",
		});
	});

	it("returns disconnected VPS when server status is not connected", async () => {
		mockDashboardServerCount(1);
		selectLimit
			.mockResolvedValueOnce([
				{
					id: "server_123",
					label: "Prod VPS",
					host: "203.0.113.10",
					port: 22,
					username: "root",
					authMethod: "password",
					encryptedCredential: "encrypted-secret",
					storeCredential: true,
					status: "disconnected",
					osInfo: {},
					updatedAt: now,
				},
			])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);

		const snapshot = await getDashboardStatusSnapshot({
			userId: "user_123",
			sessionId: "session_123",
		});

		expect(snapshot.vps).toMatchObject({
			status: "disconnected",
			cpu: null,
			memory: null,
			disk: null,
			error: null,
		});
		expect(withSshConnection).not.toHaveBeenCalled();
	});

	it("returns warning VPS health when metrics exceed thresholds", async () => {
		mockDashboardServerCount(1);
		selectLimit
			.mockResolvedValueOnce([
				{
					id: "server_123",
					label: "Prod VPS",
					host: "203.0.113.10",
					port: 22,
					username: "root",
					authMethod: "password",
					encryptedCredential: "encrypted-secret",
					storeCredential: true,
					status: "connected",
					osInfo: {},
					updatedAt: now,
				},
			])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);

		decryptSecret.mockReturnValue("ssh-key-secret");
		withSshConnection.mockImplementation(async (_config, run) => {
			const execCommand = vi
				.fn()
				.mockResolvedValueOnce({ code: 0, stdout: "92", stderr: "" })
				.mockResolvedValueOnce({ code: 0, stdout: "30", stderr: "" })
				.mockResolvedValueOnce({ code: 0, stdout: "55", stderr: "" })
				.mockResolvedValueOnce({ code: 0, stdout: "up 1 hour", stderr: "" });
			return run({ execCommand });
		});

		const snapshot = await getDashboardStatusSnapshot({
			userId: "user_123",
			sessionId: "session_123",
		});

		expect(snapshot.vps).toMatchObject({
			status: "warning",
			cpu: 92,
			memory: 30,
			disk: 55,
		});
	});

	it("handles missing stored credential for VPS metrics", async () => {
		mockDashboardServerCount(1);
		selectLimit
			.mockResolvedValueOnce([
				{
					id: "server_123",
					label: "Prod VPS",
					host: "203.0.113.10",
					port: 22,
					username: "root",
					authMethod: "password",
					encryptedCredential: null,
					storeCredential: true,
					status: "connected",
					osInfo: {},
					updatedAt: now,
				},
			])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);

		const snapshot = await getDashboardStatusSnapshot({
			userId: "user_123",
			sessionId: "session_123",
		});

		expect(snapshot.vps).toMatchObject({
			status: "error",
			cpu: null,
			memory: null,
			disk: null,
			error: "Stored credential is missing.",
		});
	});
});
