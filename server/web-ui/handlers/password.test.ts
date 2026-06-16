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
			decryptWebUiPassword: (value: string | null) =>
				value?.startsWith("enc:") ? value.slice(4) : value,
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

import { revealServerWebUiPassword } from "../handlers";

describe("web-ui password", () => {
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

	it("reveals the Web UI password for enabled servers", async () => {
		getAuthSession.mockResolvedValue({
			user: { id: "user_123" },
			session: { id: "session_123" },
		});
		getResolvedServerWebUiRecord.mockResolvedValue({
			enabled: true,
			encryptedPassword: "enc:generated-password",
			port: 8787,
			deployStatus: "succeeded",
			deployError: null,
			deployStartedAt: null,
			updatedAt: new Date("2026-05-26T04:00:00.000Z"),
		});

		const response = await revealServerWebUiPassword(createContext());
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.password).toBe("generated-password");
	});

	it("rejects unauthorized password reveal requests", async () => {
		getAuthSession.mockResolvedValue(null);

		const response = await revealServerWebUiPassword(createContext());
		expect(response.status).toBe(401);
	});
});
