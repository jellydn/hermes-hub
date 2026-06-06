import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { SettingsPage } from "@/features/settings/settings-page";
import { loadTelegramDeploy } from "@/lib/load-telegram-deploy";
import { requireSession } from "@/lib/session";
import { getAuthSession } from "../../server/auth";
import { getCurrentPersonaSettings } from "../../server/settings";

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
		const [session, personaSettings, telegramDeploy] = await Promise.all([
			requireSession(location.href),
			loadPersonaSettings(),
			loadTelegramDeploy(),
		]);

		return { session, personaSettings, telegramDeploy };
	},
	component: SettingsPage,
});
