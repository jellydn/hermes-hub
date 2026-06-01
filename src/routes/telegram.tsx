import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { TelegramSettings } from "@/features/telegram/telegram-settings";
import { requireSession } from "@/lib/session";
import { getAuthSession } from "../../server/auth";
import { getCurrentTelegramConfig } from "../../server/telegram";
import { AppShell } from "./dashboard";

const loadCurrentTelegramConfig = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getAuthSession(getRequestHeaders());
		if (!session) {
			return null;
		}

		return getCurrentTelegramConfig(session.user.id);
	},
);

export const Route = createFileRoute("/telegram")({
	beforeLoad: async ({ location }) => {
		const session = await requireSession(location.href);
		const telegramConfig = await loadCurrentTelegramConfig();

		return { session, telegramConfig };
	},
	component: TelegramPage,
});

function TelegramPage() {
	const { session, telegramConfig } = Route.useRouteContext();

	return (
		<AppShell
			userEmail={session.user.email}
			title="Telegram"
			description="Connect your Telegram bot, deploy it to Hermes, and test the integration."
			kicker="Chat Channels"
		>
			<TelegramSettings initialConfig={telegramConfig ?? null} />
		</AppShell>
	);
}
