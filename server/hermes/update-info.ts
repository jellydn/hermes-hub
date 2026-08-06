import type { Context } from "hono";

import { requireOwnedServerSsh } from "../request-guards";
import { withSshConnection } from "../ssh";
import {
	extractDigest,
	getLatestImageRef,
	getLatestRelease,
	getRunningImageRef,
	isUpdateAvailable,
	type LatestImageRef,
	type LatestRelease,
	type RunningImageRef,
} from "./version";

export type HermesUpdateInfo = {
	current: RunningImageRef | null;
	latest: LatestImageRef | null;
	release: LatestRelease | null;
	updateAvailable: boolean;
};

export async function getHermesUpdateInfo(context: Context): Promise<Response> {
	const ctx = await requireOwnedServerSsh(context);
	if (ctx instanceof Response) {
		return ctx;
	}

	try {
		const result = await withSshConnection(
			{
				host: ctx.server.host,
				port: ctx.server.port,
				username: ctx.server.username,
				authMethod: ctx.authMethod,
				credential: ctx.credential,
				expectedFingerprint: ctx.server.hostKeyFingerprint ?? undefined,
			},
			async (ssh) => collectUpdateInfo(ssh),
		);

		return context.json(result);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to fetch update info";
		return context.json({ error: message }, 400);
	}
}

async function collectUpdateInfo(
	ssh: Parameters<Parameters<typeof withSshConnection>[1]>[0],
): Promise<HermesUpdateInfo> {
	// Run the remote inspect and the two HTTP lookups concurrently. Each
	// degrades to null independently so a single failure doesn't break the
	// whole response.
	const [current, latest, release] = await Promise.all([
		getRunningImageRef(ssh).catch(() => null),
		getLatestImageRef(),
		getLatestRelease(),
	]);

	const currentDigest =
		extractDigest(current?.image) ?? extractDigest(current?.repoDigests?.[0]);
	const updateAvailable = isUpdateAvailable(currentDigest, latest?.digest);

	return { current, latest, release, updateAvailable };
}
