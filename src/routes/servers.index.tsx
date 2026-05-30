import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ServerList } from "@/features/servers/server-list";
import { requireSession } from "@/lib/session";
import { getAuthSession } from "../../server/auth";
import { AppShell } from "./dashboard";

const loadServers = createServerFn({ method: "GET" }).handler(async () => {
	const session = await getAuthSession(getRequestHeaders());
	if (!session) {
		return [];
	}

	const { getServerListSnapshot } = await import("../../server/servers");
	return getServerListSnapshot(session.user.id);
});

export const Route = createFileRoute("/servers/")({
	beforeLoad: async ({ location }) => {
		const session = await requireSession(location.href);
		const servers = await loadServers();

		return { session, servers };
	},
	component: ServersPage,
});

function ServersPage() {
	const { servers, session } = Route.useRouteContext();

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
