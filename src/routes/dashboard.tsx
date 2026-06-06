import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { requireSession } from "@/lib/session";
import { getAuthSession } from "../../server/auth";
import { getDashboardStatusSnapshot } from "../../server/dashboard";

const loadDashboardStatus = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getAuthSession(getRequestHeaders());
		if (!session) {
			return null;
		}

		return getDashboardStatusSnapshot({
			userId: session.user.id,
			sessionId: session.session.id,
		});
	},
);

export const Route = createFileRoute("/dashboard")({
	beforeLoad: async ({ location }) => {
		const [session, dashboardStatus] = await Promise.all([
			requireSession(location.href),
			loadDashboardStatus(),
		]);

		return { session, dashboardStatus };
	},
	component: DashboardPage,
});
