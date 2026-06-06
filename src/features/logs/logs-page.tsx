import { getRouteApi } from "@tanstack/react-router";

import { AppShell } from "@/features/dashboard/app-shell";
import { LogsViewer } from "@/features/logs/logs-viewer";

const logsRouteApi = getRouteApi("/logs");

export function LogsPage() {
	const { logs, session } = logsRouteApi.useRouteContext();

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
