import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getAuthSession } from "#server/auth";
import { getLogsSnapshot } from "#server/logs";
import { LogsPage } from "@/features/logs/logs-page";
import { requireSession } from "@/lib/session";

const loadLogs = createServerFn({ method: "GET" }).handler(async () => {
	const session = await getAuthSession(getRequestHeaders());
	if (!session) {
		return null;
	}

	return getLogsSnapshot(session.user.id);
});

export const Route = createFileRoute("/logs")({
	beforeLoad: async ({ location }) => {
		const [session, logs] = await Promise.all([
			requireSession(location.href),
			loadLogs(),
		]);

		return { session, logs };
	},
	component: LogsPage,
});
