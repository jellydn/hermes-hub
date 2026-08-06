import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	requireOwnedServerSsh,
	withSshConnection,
	getRunningImageRef,
	getLatestImageRef,
	getLatestRelease,
} = vi.hoisted(() => ({
	requireOwnedServerSsh: vi.fn(),
	withSshConnection: vi.fn(),
	getRunningImageRef: vi.fn(),
	getLatestImageRef: vi.fn(),
	getLatestRelease: vi.fn(),
}));

vi.mock("../request-guards", () => ({ requireOwnedServerSsh }));
vi.mock("../ssh", () => ({ withSshConnection }));

vi.mock("./version", () => ({
	getRunningImageRef,
	getLatestImageRef,
	getLatestRelease,
	isUpdateAvailable: (
		current: string | undefined,
		latest: string | undefined,
	) => !!current && !!latest && current !== latest,
	extractDigest: (value: string | undefined) => {
		if (!value) return undefined;
		const match = value.match(/sha256:[a-f0-9]{64}/i);
		return match?.[0];
	},
}));

import { getHermesUpdateInfo } from "./update-info";

const session = { user: { id: "u1" }, session: { id: "s1" } };
const server = {
	id: "server_1",
	host: "1.2.3.4",
	port: 22,
	username: "root",
	hostKeyFingerprint: "SHA256:abc",
};

function makeContext(): Context {
	return {
		req: {
			raw: { headers: new Headers() },
			param: (name: string) => (name === "id" ? "server_1" : undefined),
		},
		json: (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as unknown as Context;
}

describe("getHermesUpdateInfo", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		requireOwnedServerSsh.mockResolvedValue({
			...session,
			server,
			serverId: "server_1",
			authMethod: "password",
			credential: "secret",
		});

		withSshConnection.mockImplementation(async (_input, run) =>
			run({ execCommand: vi.fn() }),
		);
	});

	it("returns current, latest, release, and updateAvailable", async () => {
		getRunningImageRef.mockResolvedValue({
			image:
				"nousresearch/hermes-agent@sha256:0df64d3f063ed22f9a0287d0f7a4c314ed9a504cbdefe55d6803b0d40761dcb9",
			imageId: "sha256:old",
			repoDigests: [],
		});
		getLatestImageRef.mockResolvedValue({
			tag: "latest",
			digest:
				"sha256:4c8aceb35c5b309ebeb0c3bafed52544aff3ff78005cbcfb744ddbaa8829d924",
			pushedAt: "2026-08-06T12:00:00.000Z",
		});
		getLatestRelease.mockResolvedValue({
			tagName: "v2026.8.3",
			name: "Hermes Agent v0.20.0 (2026.8.3)",
			publishedAt: "2026-08-03T10:00:00.000Z",
			body: "## Changes\n- Fixed bug",
			htmlUrl:
				"https://github.com/NousResearch/hermes-agent/releases/v2026.8.3",
		});

		const response = await getHermesUpdateInfo(makeContext());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.updateAvailable).toBe(true);
		expect(body.current.image).toContain("sha256:0df64d3f");
		expect(body.latest.digest).toContain("sha256:4c8aceb");
		expect(body.release.tagName).toBe("v2026.8.3");
	});

	it("degrades sub-fields to null on failure", async () => {
		getRunningImageRef.mockResolvedValue(null);
		getLatestImageRef.mockResolvedValue(null);
		getLatestRelease.mockResolvedValue(null);

		const response = await getHermesUpdateInfo(makeContext());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.current).toBeNull();
		expect(body.latest).toBeNull();
		expect(body.release).toBeNull();
		expect(body.updateAvailable).toBe(false);
	});

	it("returns 401 when not authenticated", async () => {
		requireOwnedServerSsh.mockResolvedValue(
			new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await getHermesUpdateInfo(makeContext());

		expect(response.status).toBe(401);
		expect(withSshConnection).not.toHaveBeenCalled();
	});

	it("returns 400 when SSH connection fails", async () => {
		withSshConnection.mockRejectedValue(new Error("SSH connection refused"));

		const response = await getHermesUpdateInfo(makeContext());
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain("SSH connection refused");
	});

	it("returns false for updateAvailable when current digest matches latest", async () => {
		const sameDigest =
			"sha256:4c8aceb35c5b309ebeb0c3bafed52544aff3ff78005cbcfb744ddbaa8829d924";
		getRunningImageRef.mockResolvedValue({
			image: `nousresearch/hermes-agent@${sameDigest}`,
			imageId: "sha256:same",
			repoDigests: [],
		});
		getLatestImageRef.mockResolvedValue({
			tag: "latest",
			digest: sameDigest,
			pushedAt: "2026-08-06T12:00:00.000Z",
		});
		getLatestRelease.mockResolvedValue(null);

		const response = await getHermesUpdateInfo(makeContext());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.updateAvailable).toBe(false);
	});
});
