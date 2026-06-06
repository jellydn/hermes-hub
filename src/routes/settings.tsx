import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/features/settings/settings-page";
import { requireSession } from "@/lib/session";

export const Route = createFileRoute("/settings")({
	beforeLoad: async ({ location }) => {
		return { session: await requireSession(location.href) };
	},
	component: SettingsPage,
});
