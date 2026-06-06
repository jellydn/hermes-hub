import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOwnedServerListRecords, getLatestInstallRecords } = vi.hoisted(
	() => ({
		getOwnedServerListRecords: vi.fn(),
		getLatestInstallRecords: vi.fn(),
	}),
);

vi.mock("../servers/records", () => ({
	getOwnedServerListRecords,
	getLatestInstallRecords,
}));

import { listHermesDeploymentTargets } from "./deploy-targets";

describe("listHermesDeploymentTargets", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns only owned servers with a latest successful install", async () => {
		getOwnedServerListRecords.mockResolvedValueOnce([
			{
				id: "server_1",
				label: "Primary",
				host: "1.2.3.4",
				status: "connected",
				osInfo: {},
				updatedAt: new Date("2026-06-06T10:00:00.000Z"),
			},
			{
				id: "server_2",
				label: "Staging",
				host: "5.6.7.8",
				status: "connected",
				osInfo: {},
				updatedAt: new Date("2026-06-06T09:00:00.000Z"),
			},
		]);
		getLatestInstallRecords.mockResolvedValueOnce([
			{
				serverId: "server_1",
				status: "succeeded",
				updatedAt: new Date("2026-06-06T12:00:00.000Z"),
			},
			{
				serverId: "server_2",
				status: "failed",
				updatedAt: new Date("2026-06-06T11:00:00.000Z"),
			},
		]);

		const targets = await listHermesDeploymentTargets("user_123");

		expect(targets).toEqual([
			{
				serverId: "server_1",
				label: "Primary",
				host: "1.2.3.4",
				installUpdatedAt: "2026-06-06T12:00:00.000Z",
			},
		]);
	});

	it("sorts targets by latest install update descending", async () => {
		getOwnedServerListRecords.mockResolvedValueOnce([
			{
				id: "server_old",
				label: "Older",
				host: "1.1.1.1",
				status: "connected",
				osInfo: {},
				updatedAt: new Date("2026-06-01T10:00:00.000Z"),
			},
			{
				id: "server_new",
				label: "Newer",
				host: "2.2.2.2",
				status: "connected",
				osInfo: {},
				updatedAt: new Date("2026-06-02T10:00:00.000Z"),
			},
		]);
		getLatestInstallRecords.mockResolvedValueOnce([
			{
				serverId: "server_old",
				status: "succeeded",
				updatedAt: new Date("2026-06-05T12:00:00.000Z"),
			},
			{
				serverId: "server_new",
				status: "succeeded",
				updatedAt: new Date("2026-06-06T12:00:00.000Z"),
			},
		]);

		const targets = await listHermesDeploymentTargets("user_123");

		expect(targets.map((target) => target.serverId)).toEqual([
			"server_new",
			"server_old",
		]);
	});
});
