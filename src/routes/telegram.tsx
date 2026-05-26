import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/session";
import { AppShell } from "./dashboard";

export const Route = createFileRoute("/telegram")({
	beforeLoad: async ({ location }) => {
		return { session: await requireSession(location.href) };
	},
	component: TelegramPage,
});

function TelegramPage() {
	const { session } = Route.useRouteContext();

	return (
		<AppShell
			userEmail={session.user.email}
			title="Telegram"
			description="Telegram bot onboarding will plug into this protected page in a later story."
			kicker="Chat Channels"
		>
			<section className="island-shell rounded-[2rem] p-6 sm:p-8">
				<p className="island-kicker mb-2">Protected Route Ready</p>
				<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					Navigation, auth guard, and main content framing are already in place
					for the Telegram connection flow.
				</p>
			</section>
		</AppShell>
	);
}
