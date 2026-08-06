import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	extractDigest,
	getLatestImageRef,
	getLatestRelease,
	getRunningImageRef,
	isUpdateAvailable,
} from "./version";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("getRunningImageRef", () => {
	it("parses docker inspect output into image, imageId, and repoDigests", async () => {
		const execCommand = vi.fn(async () => ({
			code: 0,
			stdout:
				'nousresearch/hermes-agent@sha256:abc|sha256:def|["nousresearch/hermes-agent@sha256:abc"]',
			stderr: "",
		}));

		const result = await getRunningImageRef({ execCommand } as never);

		expect(result).toEqual({
			image: "nousresearch/hermes-agent@sha256:abc",
			imageId: "sha256:def",
			repoDigests: ["nousresearch/hermes-agent@sha256:abc"],
		});
	});

	it("returns null when the container does not exist", async () => {
		const execCommand = vi.fn(async () => ({
			code: 1,
			stdout: "",
			stderr: "No such container",
		}));

		const result = await getRunningImageRef({ execCommand } as never);

		expect(result).toBeNull();
	});

	it("returns null when output is empty", async () => {
		const execCommand = vi.fn(async () => ({
			code: 0,
			stdout: "",
			stderr: "",
		}));

		const result = await getRunningImageRef({ execCommand } as never);

		expect(result).toBeNull();
	});

	it("handles malformed repoDigests json gracefully", async () => {
		const execCommand = vi.fn(async () => ({
			code: 0,
			stdout: "image|imageId|not-valid-json",
			stderr: "",
		}));

		const result = await getRunningImageRef({ execCommand } as never);

		expect(result).toEqual({
			image: "image",
			imageId: "imageId",
			repoDigests: [],
		});
	});
});

describe("getLatestImageRef", () => {
	it("fetches and parses the latest tag from Docker Hub", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					name: "latest",
					digest:
						"sha256:4c8aceb35c5b309ebeb0c3bafed52544aff3ff78005cbcfb744ddbaa8829d924",
					tag_last_pushed: "2026-08-06T12:00:00.000Z",
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);

		const result = await getLatestImageRef();

		expect(result).toEqual({
			tag: "latest",
			digest:
				"sha256:4c8aceb35c5b309ebeb0c3bafed52544aff3ff78005cbcfb744ddbaa8829d924",
			pushedAt: "2026-08-06T12:00:00.000Z",
		});
	});

	it("returns null on non-200 response", async () => {
		fetchMock.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

		const result = await getLatestImageRef();

		expect(result).toBeNull();
	});

	it("returns null when digest is missing from response", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ name: "latest", tag_last_pushed: "2026-01-01" }),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);

		const result = await getLatestImageRef();

		expect(result).toBeNull();
	});

	it("returns null on network error", async () => {
		fetchMock.mockRejectedValueOnce(new Error("Network error"));

		const result = await getLatestImageRef();

		expect(result).toBeNull();
	});
});

describe("getLatestRelease", () => {
	it("fetches and parses the latest GitHub release", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					tag_name: "v2026.8.3",
					name: "Hermes Agent v0.20.0 (2026.8.3)",
					published_at: "2026-08-03T10:00:00.000Z",
					body: "## Changes\n- Fixed bug\n- Added feature",
					html_url:
						"https://github.com/NousResearch/hermes-agent/releases/v2026.8.3",
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);

		const result = await getLatestRelease();

		expect(result).toEqual({
			tagName: "v2026.8.3",
			name: "Hermes Agent v0.20.0 (2026.8.3)",
			publishedAt: "2026-08-03T10:00:00.000Z",
			body: "## Changes\n- Fixed bug\n- Added feature",
			htmlUrl:
				"https://github.com/NousResearch/hermes-agent/releases/v2026.8.3",
		});
	});

	it("returns null on non-200 response", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response("rate limited", { status: 403 }),
		);

		const result = await getLatestRelease();

		expect(result).toBeNull();
	});

	it("returns null on network error", async () => {
		fetchMock.mockRejectedValueOnce(new Error("Network error"));

		const result = await getLatestRelease();

		expect(result).toBeNull();
	});

	it("returns null when tag_name or html_url is missing", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ name: "some release" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const result = await getLatestRelease();

		expect(result).toBeNull();
	});
});

describe("isUpdateAvailable", () => {
	it("returns true when digests differ", () => {
		expect(
			isUpdateAvailable("sha256:aaaabbbbcccc", "sha256:ddddeeeeffff"),
		).toBe(true);
	});

	it("returns false when digests are the same", () => {
		expect(
			isUpdateAvailable("sha256:aaaabbbbcccc", "sha256:aaaabbbbcccc"),
		).toBe(false);
	});

	it("returns false when current digest is missing", () => {
		expect(isUpdateAvailable(undefined, "sha256:abc")).toBe(false);
	});

	it("returns false when latest digest is missing", () => {
		expect(isUpdateAvailable("sha256:abc", undefined)).toBe(false);
	});

	it("is case-insensitive when comparing digests", () => {
		expect(isUpdateAvailable("sha256:ABCDEF", "sha256:abcdef")).toBe(false);
	});
});

describe("extractDigest", () => {
	it("extracts a sha256 digest from an image ref", () => {
		expect(
			extractDigest(
				"nousresearch/hermes-agent@sha256:0df64d3f063ed22f9a0287d0f7a4c314ed9a504cbdefe55d6803b0d40761dcb9",
			),
		).toBe(
			"sha256:0df64d3f063ed22f9a0287d0f7a4c314ed9a504cbdefe55d6803b0d40761dcb9",
		);
	});

	it("returns undefined when no digest is present", () => {
		expect(extractDigest("nousresearch/hermes-agent:latest")).toBeUndefined();
	});

	it("returns undefined for empty input", () => {
		expect(extractDigest(undefined)).toBeUndefined();
	});
});
