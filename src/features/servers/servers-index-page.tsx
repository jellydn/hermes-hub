import { getRouteApi, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { Button } from "#/components/ui/button";
import { AppShell } from "#/features/dashboard/app-shell";
import { ServerList } from "#/features/servers/server-list";

const serversRouteApi = getRouteApi("/servers/");

export function ServersIndexPage() {
	const { servers, session } = serversRouteApi.useRouteContext();

	return (
		<AppShell
			userEmail={session.user.email}
			title="Servers"
			description="List every connected VPS, jump into the populated manage form for an existing server, or start a fresh server connection when you need another target."
			kicker="Infrastructure"
			actions={
				<Button asChild>
					<Link to="/servers/new">
						<Plus className="h-4 w-4" />
						<span>New server</span>
					</Link>
				</Button>
			}
		>
			<ServerList servers={servers} />
		</AppShell>
	);
}
