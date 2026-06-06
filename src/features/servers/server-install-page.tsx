import { getRouteApi } from "@tanstack/react-router";

import { AppShell } from "@/features/dashboard/app-shell";
import { ServerInstallProgress } from "@/features/servers/install-progress";

const serverInstallRouteApi = getRouteApi("/servers/$id/install");

export function ServerInstallPage() {
	const { session } = serverInstallRouteApi.useRouteContext();
	const { id } = serverInstallRouteApi.useParams();
	const navigate = serverInstallRouteApi.useNavigate();

	return (
		<AppShell
			userEmail={session.user.email}
			title="Install Progress"
			description="Track the Hermes install in real time, review the log stream, and resume from the latest persisted progress if you return later."
			kicker="Deployment"
		>
			<ServerInstallProgress
				key={id}
				serverId={id}
				onGoToDashboard={() => {
					void navigate({ to: "/dashboard" });
				}}
			/>
		</AppShell>
	);
}
