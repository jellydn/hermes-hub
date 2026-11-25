import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	extractDigest,
	getLatestImageRef,
	getLatestRelease,
	getRunningImageRef,
	isHermesVersionAtLeast,
	isUpdateAvailable,
	parseHermesVersion,
	shouldOfferUpdate,
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
	const imageId =
		"sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf";

	/** Answers like Docker: a container has no RepoDigests field. */
	function dockerHost(container: string | null) {
		return vi.fn(async (cmd: string) => {
			if (cmd.startsWith("sudo docker inspect hermes")) {
				if (cmd.includes("RepoDigests")) {
					return {
						code: 1,
						stdout: "",
						stderr:
							'template parsing error: map has no entry for key "RepoDigests"',
					};
				}
				return container
					? { code: 0, stdout: `${container}|${imageId}\n`, stderr: "" }
					: { code: 1, stdout: "", stderr: "No such object: hermes" };
			}
			if (cmd.startsWith(`sudo docker image inspect ${imageId}`)) {
				return {
					code: 0,
					stdout: "nousresearch/hermes-agent@sha256:abc\n",
					stderr: "",
				};
			}
			return { code: 1, stdout: "", stderr: "unexpected command" };
		});
	}

	it("reads the container image and the image's repo digests", async () => {
		const execCommand = dockerHost("nousresearch/hermes-agent:latest");

		const result = await getRunningImageRef({ execCommand } as never);

		expect(result).toEqual({
			image: "nousresearch/hermes-agent:latest",
			imageId,
			repoDigests: ["nousresearch/hermes-agent@sha256:abc"],
		});
	});

	it("returns null when the container does not exist", async () => {
		const execCommand = dockerHost(null);

		expect(await getRunningImageRef({ execCommand } as never)).toBeNull();
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

describe("shouldOfferUpdate", () => {
	const digest =
		"sha256:ef0650d523ee1b5ab32c779acabc446d9936869a9932591553688a62bcf0c42f";

	it("offers the update when the running release is older, even with equal digests", () => {
		expect(
			shouldOfferUpdate({
				currentDigest: digest,
				latestDigest: digest,
				currentVersion: "0.16.0",
				releaseTag: "v0.23.4",
			}),
		).toBe(true);
	});

	it("offers the update when the running digest is unknown", () => {
		expect(
			shouldOfferUpdate({
				currentDigest: undefined,
				latestDigest: digest,
				currentVersion: "0.23.4",
				releaseTag: "v0.23.4",
			}),
		).toBe(true);
	});

	it("is up to date only when the digest is known and matches", () => {
		expect(
			shouldOfferUpdate({
				currentDigest: digest,
				latestDigest: digest,
				currentVersion: "0.23.4",
				releaseTag: "v0.23.4",
			}),
		).toBe(false);
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

describe("parseHermesVersion", () => {
	it("reads the release from hermes --version output", () => {
		expect(parseHermesVersion("Hermes Agent v0.23.4 (2026.11.24)\n")).toBe(
			"0.23.4",
		);
		expect(parseHermesVersion("Hermes Agent v0.16.0 (2026.6.5)")).toBe(
			"0.16.0",
		);
		expect(parseHermesVersion("command not found")).toBeNull();
	});
});

describe("isHermesVersionAtLeast", () => {
	it("compares numerically, not as strings", () => {
		expect(isHermesVersionAtLeast("0.21.10", "0.21.6")).toBe(true);
		expect(isHermesVersionAtLeast("0.21.5", "0.21.6")).toBe(false);
		expect(isHermesVersionAtLeast("0.21.6", "0.21.6")).toBe(true);
		expect(isHermesVersionAtLeast("1.0.0", "0.21.6")).toBe(true);
	});
});
