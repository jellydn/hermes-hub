import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/session";
import { AppShell } from "./dashboard";

export const Route = createFileRoute("/settings")({
	beforeLoad: async ({ location }) => {
		return { session: await requireSession(location.href) };
	},
	component: SettingsPage,
});

function SettingsPage() {
	const { session } = Route.useRouteContext();

	return (
		<AppShell
			userEmail={session.user.email}
			title="Settings"
			description="Workspace preferences and account-level controls will grow into this area over the remaining MVP stories."
			kicker="Workspace"
		>
			<section className="island-shell rounded-[2rem] p-6 sm:p-8">
				<p className="island-kicker mb-2">Shell Complete</p>
				<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					The responsive dashboard frame is now shared across all primary
					authenticated sections, including this settings stub.
				</p>
			</section>
		</AppShell>
	);
}
