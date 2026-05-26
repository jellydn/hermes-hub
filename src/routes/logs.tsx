import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/session";
import { AppShell } from "./dashboard";

export const Route = createFileRoute("/logs")({
	beforeLoad: async ({ location }) => {
		return { session: await requireSession(location.href) };
	},
	component: LogsPage,
});

function LogsPage() {
	const { session } = Route.useRouteContext();

	return (
		<AppShell
			userEmail={session.user.email}
			title="Logs"
			description="Install history and action logs will surface here once backend operations are wired up."
			kicker="Audit Trail"
		>
			<section className="island-shell rounded-[2rem] p-6 sm:p-8">
				<p className="island-kicker mb-2">Future Viewer</p>
				<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					This placeholder keeps the sidebar complete and gives later stories a
					stable route target for log rendering.
				</p>
			</section>
		</AppShell>
	);
}
