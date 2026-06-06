import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { AiProviderPage } from "@/features/providers/ai-provider-page";
import { requireSession } from "@/lib/session";
import { getAuthSession } from "../../server/auth";
import { getCurrentProviderConfig } from "../../server/providers";
import { getCurrentTelegramConfig } from "../../server/telegram";

const loadCurrentProviderConfig = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getAuthSession(getRequestHeaders());
		if (!session) {
			return null;
		}

		return getCurrentProviderConfig(session.user.id);
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

export const Route = createFileRoute("/ai-provider")({
	beforeLoad: async ({ location }) => {
		const session = await requireSession(location.href);
		const [providerConfig, telegramDeploy] = await Promise.all([
			loadCurrentProviderConfig(),
			loadTelegramDeploy(),
		]);

		return { session, providerConfig, telegramDeploy };
	},
	component: AiProviderPage,
});
