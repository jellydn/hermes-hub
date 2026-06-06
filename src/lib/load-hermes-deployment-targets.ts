import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { getAuthSession } from "../../server/auth";
import { listHermesDeploymentTargets } from "../../server/hermes/deploy-targets";

export type HermesDeploymentTarget = {
	serverId: string;
	label: string;
	host: string;
	installUpdatedAt: string;
};

export const loadHermesDeploymentTargets = createServerFn({
	method: "GET",
}).handler(async () => {
	const session = await getAuthSession(getRequestHeaders());
	if (!session) {
		return [];
	}

	return listHermesDeploymentTargets(session.user.id);
});
