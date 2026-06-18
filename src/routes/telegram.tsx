import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { TelegramPage } from "#/features/telegram/telegram-page";
import { requireSession } from "#/lib/session";
import { getAuthSession } from "#server/auth";
import { getModelAccessSnapshot } from "#server/providers";
import { getCurrentTelegramConfig } from "#server/telegram";

const loadCurrentTelegramConfig = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getAuthSession(getRequestHeaders());
		if (!session) {
			return null;
		}

		return getCurrentTelegramConfig(session.user.id);
	},
);

const loadModelAccessSnapshot = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getAuthSession(getRequestHeaders());
		if (!session) {
			return null;
		}

		return getModelAccessSnapshot(session.user.id);
	},
);

export const Route = createFileRoute("/telegram")({
	beforeLoad: async ({ location }) => {
		const [session, telegramConfig, modelAccess] = await Promise.all([
			requireSession(location.href),
			loadCurrentTelegramConfig(),
			loadModelAccessSnapshot(),
		]);

		return { session, telegramConfig, modelAccess };
	},
	component: TelegramPage,
});
