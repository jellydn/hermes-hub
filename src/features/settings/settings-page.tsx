import { getRouteApi } from "@tanstack/react-router";

import { AppShell } from "@/features/dashboard/app-shell";

const settingsRouteApi = getRouteApi("/settings");

export function SettingsPage() {
	const { session } = settingsRouteApi.useRouteContext();

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
