import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { LogsViewer } from "@/features/logs/logs-viewer";
import { requireSession } from "@/lib/session";
import { getAuthSession } from "../../server/auth";
import { getLogsSnapshot } from "../../server/logs";
import { AppShell } from "./dashboard";

const loadLogs = createServerFn({ method: "GET" }).handler(async () => {
	const session = await getAuthSession(getRequestHeaders());
	if (!session) {
		return null;
	}

	return getLogsSnapshot(session.user.id);
});

export const Route = createFileRoute("/logs")({
	beforeLoad: async ({ location }) => {
		const session = await requireSession(location.href);
		const logs = await loadLogs();

		return { session, logs };
	},
	component: LogsPage,
});

function LogsPage() {
	const { logs, session } = Route.useRouteContext();

	return (
		<AppShell
			userEmail={session.user.email}
			title="Logs"
			description="Read the latest install output, review recent restart or update results, and export the current operational history in one place."
			kicker="Audit Trail"
		>
			<LogsViewer initialLogs={logs ?? { installLogs: [], actionLogs: [] }} />
		</AppShell>
	);
}
