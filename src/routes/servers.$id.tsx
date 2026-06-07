import { createFileRoute } from "@tanstack/react-router";

import { ServerDetailPage } from "#/features/servers/server-detail-page";
import { requireSession } from "#/lib/session";

export const Route = createFileRoute("/servers/$id")({
	beforeLoad: async ({ location }) => {
		return { session: await requireSession(location.href) };
	},
	component: ServerDetailPage,
});
