import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { ServersIndexPage } from "@/features/servers/servers-index-page";
import { requireSession } from "@/lib/session";
import { getAuthSession } from "../../server/auth";

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
		const [session, servers] = await Promise.all([
			requireSession(location.href),
			loadServers(),
		]);

		return { session, servers };
	},
	component: ServersIndexPage,
});
