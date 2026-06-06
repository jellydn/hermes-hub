import {
	getLatestInstallRecords,
	getOwnedServerListRecords,
} from "../servers/records";

export type HermesDeploymentTarget = {
	serverId: string;
	label: string;
	host: string;
	installUpdatedAt: string;
};

export async function listHermesDeploymentTargets(
	userId: string,
): Promise<HermesDeploymentTarget[]> {
	const serverRecords = await getOwnedServerListRecords(userId);
	if (serverRecords.length === 0) {
		return [];
	}

	const serverIds = serverRecords.map((server) => server.id);
	const installRecords = await getLatestInstallRecords(serverIds);
	const latestInstallByServerId = new Map<
		string,
		{ status: string; updatedAt: Date }
	>();

	for (const record of installRecords) {
		if (!latestInstallByServerId.has(record.serverId)) {
			latestInstallByServerId.set(record.serverId, {
				status: record.status,
				updatedAt: record.updatedAt,
			});
		}
	}

	const targets: HermesDeploymentTarget[] = [];

	for (const server of serverRecords) {
		const install = latestInstallByServerId.get(server.id);
		if (install?.status !== "succeeded") {
			continue;
		}

		targets.push({
			serverId: server.id,
			label: server.label,
			host: server.host,
			installUpdatedAt: install.updatedAt.toISOString(),
		});
	}

	return targets.sort(
		(left, right) =>
			new Date(right.installUpdatedAt).getTime() -
			new Date(left.installUpdatedAt).getTime(),
	);
}
