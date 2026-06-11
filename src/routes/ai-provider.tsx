import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { AiProviderPage } from "#/features/providers/ai-provider-page";
import { loadTelegramDeploy } from "#/lib/load-telegram-deploy";
import { requireSession } from "#/lib/session";
import { getAuthSession } from "#server/auth";
import { getModelAccessSnapshot } from "#server/providers";

const loadModelAccessSnapshot = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getAuthSession(getRequestHeaders());
		if (!session) {
			return null;
		}

		return getModelAccessSnapshot(session.user.id);
	},
);

export const Route = createFileRoute("/ai-provider")({
	beforeLoad: async ({ location }) => {
		const [session, modelAccess, telegramDeploy] = await Promise.all([
			requireSession(location.href),
			loadModelAccessSnapshot(),
			loadTelegramDeploy(),
		]);

		return { session, modelAccess, telegramDeploy };
	},
	component: AiProviderPage,
});
