import { getRouteApi, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { AppShell } from "@/features/dashboard/app-shell";
import { DashboardStatusOverview } from "@/features/dashboard/status-overview";

const dashboardRouteApi = getRouteApi("/dashboard");

export function DashboardPage() {
	const { dashboardStatus, session } = dashboardRouteApi.useRouteContext();
	const serverCount = dashboardStatus?.serverCount ?? 0;

	return (
		<AppShell
			userEmail={session.user.email}
			title="Mission control"
			description="Track Hermes health, confirm the VPS is still responsive, and see whether provider and Telegram integrations are ready without leaving the dashboard."
			kicker="Dashboard"
			actions={
				<Button asChild size="sm">
					<Link to="/servers">
						<span>Servers {serverCount > 0 ? `(${serverCount})` : ""}</span>
					</Link>
				</Button>
			}
		>
			<DashboardStatusOverview initialStatus={dashboardStatus ?? null} />
		</AppShell>
	);
}
