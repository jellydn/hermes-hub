import { CheckCircle2 } from "lucide-react";

import type { TelegramSettingsSummary } from "./telegram-settings";

type TelegramSidebarProps = {
	savedConfig: TelegramSettingsSummary | null;
};

export function TelegramSidebar({ savedConfig }: TelegramSidebarProps) {
	const isDeployed = Boolean(savedConfig?.deployedServerHost);
	const deployedHost = savedConfig?.deployedServerHost ?? null;

	return (
		<aside className="space-y-4">
			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Connected bot</p>
				<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
					{savedConfig?.botUsername ?? "No Telegram bot connected"}
				</h3>
				<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
					{savedConfig
						? `Status: ${savedConfig.isActive ? "Connected" : "Disconnected"}`
						: "Connect your Telegram bot to let Hermes reply in chat."}
				</p>
				{savedConfig?.botTokenLast4 ? (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
						Stored token ending in {savedConfig.botTokenLast4}
					</p>
				) : null}
				{isDeployed && deployedHost ? (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
						<CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-[var(--alert-success-fg)]" />
						Deployed to {deployedHost}
					</p>
				) : null}
			</section>

			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Why this matters</p>
				<ul className="m-0 space-y-3 pl-5 text-sm text-[var(--sea-ink-soft)]">
					<li>Hermes uses your bot token to verify the bot is real.</li>
					<li>
						Deploy the token to your VPS so Hermes can send and receive messages
						through Telegram.
					</li>
					<li>
						Disconnect keeps the saved history but disables the active bot.
					</li>
				</ul>
			</section>
		</aside>
	);
}
