import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { SettingsPage } from "@/features/settings/settings-page";
import { requireSession } from "@/lib/session";
import { getAuthSession } from "../../server/auth";
import { getCurrentPersonaSettings } from "../../server/settings";
import { getCurrentTelegramConfig } from "../../server/telegram";

const loadPersonaSettings = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getAuthSession(getRequestHeaders());
		if (!session) {
			return null;
		}

		return getCurrentPersonaSettings(session.user.id);
	},
);

const loadTelegramDeploy = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getAuthSession(getRequestHeaders());
		if (!session) {
			return null;
		}

		const telegramConfig = await getCurrentTelegramConfig(session.user.id);
		if (!telegramConfig?.deployedServerHost) {
			return null;
		}

		return {
			deployedServerHost: telegramConfig.deployedServerHost,
		};
	},
);

export const Route = createFileRoute("/settings")({
	beforeLoad: async ({ location }) => {
		const [session, personaSettings, telegramDeploy] = await Promise.all([
			requireSession(location.href),
			loadPersonaSettings(),
			loadTelegramDeploy(),
		]);

		return { session, personaSettings, telegramDeploy };
	},
	component: SettingsPage,
});
