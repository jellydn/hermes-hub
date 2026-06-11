import { createFileRoute } from "@tanstack/react-router";

import { NewServerPage } from "#/features/servers/new-server-page";
import { requireSession } from "#/lib/session";

export const Route = createFileRoute("/servers/new")({
	beforeLoad: async ({ location }) => {
		return { session: await requireSession(location.href) };
	},
	component: NewServerPage,
});
