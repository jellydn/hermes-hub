import type { NodeSSH } from "node-ssh";

import {
	hermesContainerName,
	hermesDockerHubRepo,
	hermesGitHubRepo,
} from "../constants";

/** Running container image details read via `docker inspect`. */
export type RunningImageRef = {
	/** Image reference from compose, e.g. `nousresearch/hermes-agent@sha256:...`. */
	image: string;
	/** Container image ID (sha256:...). */
	imageId: string;
	/** `RepoDigests` array from docker inspect. */
	repoDigests: string[];
};

/** Latest image tag info from Docker Hub. */
export type LatestImageRef = {
	tag: string;
	/** Manifest digest (`sha256:...`). */
	digest: string;
	pushedAt: string;
};

/** GitHub release info for the changelog display. */
export type LatestRelease = {
	tagName: string;
	name: string;
	publishedAt: string;
	body: string;
	htmlUrl: string;
};

const HTTP_TIMEOUT_MS = 10_000;

/**
 * Inspect the running Hermes container and return its image reference, image ID,
 * and repo digests. Returns `null` when the container does not exist.
 */
export async function getRunningImageRef(
	ssh: NodeSSH,
): Promise<RunningImageRef | null> {
	const result = await ssh.execCommand(
		`sudo docker inspect ${hermesContainerName} --format '{{.Config.Image}}|{{.Image}}|{{json .RepoDigests}}' 2>/dev/null`,
	);

	if (result.code !== 0) {
		return null;
	}

	const raw = result.stdout?.trim();
	if (!raw) {
		return null;
	}

	const [image, imageId, repoDigestsRaw] = raw.split("|");
	if (!image || !imageId) {
		return null;
	}

	let repoDigests: string[] = [];
	if (repoDigestsRaw) {
		try {
			const parsed = JSON.parse(repoDigestsRaw) as unknown;
			if (Array.isArray(parsed)) {
				repoDigests = parsed.filter(
					(value): value is string => typeof value === "string",
				);
			}
		} catch {
			// Malformed RepoDigests JSON — leave empty.
		}
	}

	return { image, imageId, repoDigests };
}

/**
 * Fetch the `latest` tag info from Docker Hub. Returns `null` on any failure
 * (network error, non-200, malformed body) so callers can degrade gracefully.
 */
export async function getLatestImageRef(): Promise<LatestImageRef | null> {
	try {
		const response = await fetchWithTimeout(
			`https://hub.docker.com/v2/repositories/${hermesDockerHubRepo}/tags/latest`,
			{ headers: { accept: "application/json" } },
		);

		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as {
			name?: string;
			digest?: string;
			tag_last_pushed?: string;
		};

		if (!data.digest || !data.tag_last_pushed) {
			return null;
		}

		return {
			tag: data.name ?? "latest",
			digest: data.digest,
			pushedAt: data.tag_last_pushed,
		};
	} catch {
		return null;
	}
}

/**
 * Fetch the latest GitHub release for the changelog. Returns `null` on any
 * failure — the changelog is non-critical and version info still works without it.
 */
export async function getLatestRelease(): Promise<LatestRelease | null> {
	try {
		const response = await fetchWithTimeout(
			`https://api.github.com/repos/${hermesGitHubRepo}/releases/latest`,
			{
				headers: {
					accept: "application/vnd.github+json",
					"user-agent": "HermesHub",
				},
			},
		);

		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as {
			tag_name?: string;
			name?: string;
			published_at?: string;
			body?: string;
			html_url?: string;
		};

		if (!data.tag_name || !data.html_url) {
			return null;
		}

		return {
			tagName: data.tag_name,
			name: data.name ?? data.tag_name,
			publishedAt: data.published_at ?? "",
			body: data.body ?? "",
			htmlUrl: data.html_url,
		};
	} catch {
		return null;
	}
}

/**
 * Compare the current running digest against the latest available digest.
 * Returns `false` when either digest is missing (don't claim an update when
 * the state is unknown).
 */
export function isUpdateAvailable(
	currentDigest: string | undefined,
	latestDigest: string | undefined,
): boolean {
	if (!currentDigest || !latestDigest) {
		return false;
	}

	return normalizeDigest(currentDigest) !== normalizeDigest(latestDigest);
}

/** Extract the `sha256:...` digest from a repo digest string like `nousresearch/hermes-agent@sha256:abc`. */
export function extractDigest(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	const match = value.match(/sha256:[a-f0-9]{64}/i);
	return match?.[0]?.toLowerCase();
}

function normalizeDigest(digest: string): string {
	return digest.toLowerCase().replace(/^sha256:/, "");
}

async function fetchWithTimeout(
	url: string,
	init?: RequestInit,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}
