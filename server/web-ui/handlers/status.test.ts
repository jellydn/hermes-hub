import { beforeEach, describe, expect, it, vi } from "vitest";

import { createContext } from "./test-helpers";

const { getAuthSession, getOwnedServerRecord, getResolvedServerWebUiRecord } =
	vi.hoisted(() => ({
		getAuthSession: vi.fn(),
		getOwnedServerRecord: vi.fn(),
		getResolvedServerWebUiRecord: vi.fn(),
	}));

vi.mock("../../auth", () => ({
	getAuthSession,
}));

vi.mock("../../crypto", () => ({}));

vi.mock("../../server-records", () => ({
	getOwnedServerRecord,
}));

vi.mock(
	"../records",
	async (importOriginal: () => Promise<typeof import("../records")>) => {
		const actual = await importOriginal();
		return {
			...actual,
			getResolvedServerWebUiRecord,
		};
	},
);

vi.mock("../proxy", () => ({}));

vi.mock("../../lib/get-client-ip", () => ({
	getClientIp: () => "127.0.0.1",
}));

vi.mock("../../db", () => ({
	getDb: () => ({}),
}));

import { getServerWebUiStatus } from "../handlers";

describe("web-ui status", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		getOwnedServerRecord.mockResolvedValue({
			id: "server_123",
			host: "203.0.113.10",
			port: 22,
			username: "root",
			hostKeyFingerprint: null,
		});
	});

	it("returns current Web UI status", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		const response = await getServerWebUiStatus(createContext());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.webUi?.deployStatus).toBe("succeeded");
		expect(payload.webUi?.enabled).toBe(true);
	});

	it("rejects unauthorized status requests", async () => {
		getAuthSession.mockResolvedValue(null);

		const response = await getServerWebUiStatus(createContext());
		expect(response.status).toBe(401);
	});
});
