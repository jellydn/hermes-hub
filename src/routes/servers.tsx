import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/lib/session";
import { AppShell } from "./dashboard";

export const Route = createFileRoute("/servers")({
	beforeLoad: async ({ location }) => {
		return { session: await requireSession(location.href) };
	},
	component: ServersPage,
});

function ServersPage() {
	const { session } = Route.useRouteContext();

	return (
		<AppShell
			userEmail={session.user.email}
			title="Servers"
			description="This area will guide users through connecting and managing their VPS inventory."
			kicker="Infrastructure"
		>
			<section className="island-shell rounded-[2rem] p-6 sm:p-8">
				<p className="island-kicker mb-2">Coming Next</p>
				<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
					Your first VPS will appear here.
				</h3>
				<p className="mt-3 mb-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					The connection wizard lands in the next story. For now, this route
					anchors the dashboard navigation and reserved layout.
				</p>
			</section>
		</AppShell>
	);
}
