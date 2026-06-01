import { and, desc, eq } from "drizzle-orm";

import { getDb } from "../db";
import { installs, servers } from "../db/schema";
import { installSteps } from "./workflow";

export async function upsertInstallRecord(serverId: string) {
	const db = getDb();
	const [existingInstall] = await db
		.select({ id: installs.id })
		.from(installs)
		.where(eq(installs.serverId, serverId))
		.orderBy(desc(installs.createdAt))
		.limit(1);

	if (!existingInstall) {
		const [createdInstall] = await db
			.insert(installs)
			.values({
				serverId,
				status: "pending",
				step: installSteps[0]?.id ?? "pending",
				log: null,
				version: "latest",
			})
			.returning({ id: installs.id });

		return createdInstall;
	}

	const [updatedInstall] = await db
		.update(installs)
		.set({
			status: "pending",
			step: installSteps[0]?.id ?? "pending",
			log: null,
			version: "latest",
			updatedAt: new Date(),
		})
		.where(eq(installs.id, existingInstall.id))
		.returning({ id: installs.id });

	return updatedInstall;
}

export async function getServerForInstall(input: {
	serverId: string;
	userId: string;
}) {
	const [serverRecord] = await getDb()
		.select({
			id: servers.id,
			host: servers.host,
			port: servers.port,
			username: servers.username,
			authMethod: servers.authMethod,
			encryptedCredential: servers.encryptedCredential,
			storeCredential: servers.storeCredential,
			hostKeyFingerprint: servers.hostKeyFingerprint,
		})
		.from(servers)
		.where(
			and(eq(servers.id, input.serverId), eq(servers.userId, input.userId)),
		)
		.limit(1);

	return serverRecord ?? null;
}
