import { getRouteApi } from "@tanstack/react-router";

import { AppShell } from "@/features/dashboard/app-shell";
import { TelegramSettings } from "@/features/telegram/telegram-settings";

const telegramRouteApi = getRouteApi("/telegram");

export function TelegramPage() {
	const { session, telegramConfig } = telegramRouteApi.useRouteContext();

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
