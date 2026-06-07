import { createFileRoute } from "@tanstack/react-router";

import { ServerInstallPage } from "#/features/servers/server-install-page";
import { requireSession } from "#/lib/session";

export const Route = createFileRoute("/servers/$id/install")({
	beforeLoad: async ({ location }) => {
		return { session: await requireSession(location.href) };
	},
	component: ServerInstallPage,
});
