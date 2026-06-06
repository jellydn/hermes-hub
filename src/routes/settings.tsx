import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { SettingsPage } from "@/features/settings/settings-page";
import { loadHermesDeploymentTargets } from "@/lib/load-hermes-deployment-targets";
import { requireSession } from "@/lib/session";
import { getAuthSession } from "../../server/auth";
import { getCurrentPersonaSettings } from "../../server/settings";
import { getCurrentMcpServers } from "../../server/settings/mcp";

const loadMcpServers = createServerFn({ method: "GET" }).handler(async () => {
	const session = await getAuthSession(getRequestHeaders());
	if (!session) {
		return [];
	}

	return getCurrentMcpServers(session.user.id);
});

const loadPersonaSettings = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getAuthSession(getRequestHeaders());
		if (!session) {
			return null;
		}

		return getCurrentPersonaSettings(session.user.id);
	},
);

export const Route = createFileRoute("/settings")({
	beforeLoad: async ({ location }) => {
		const [session, personaSettings, mcpServers, deploymentTargets] =
			await Promise.all([
				requireSession(location.href),
				loadPersonaSettings(),
				loadMcpServers(),
				loadHermesDeploymentTargets(),
			]);

		return { session, personaSettings, mcpServers, deploymentTargets };
	},
	component: SettingsPage,
});
