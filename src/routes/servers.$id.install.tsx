import { createFileRoute } from "@tanstack/react-router";

import { ServerInstallProgress } from "@/features/servers/install-progress";
import { requireSession } from "@/lib/session";

import { AppShell } from "./dashboard";

export const Route = createFileRoute("/servers/$id/install")({
	beforeLoad: async ({ location }) => {
		return { session: await requireSession(location.href) };
	},
	component: ServerInstallPage,
});

function ServerInstallPage() {
	const { session } = Route.useRouteContext();
	const { id } = Route.useParams();
	const navigate = Route.useNavigate();

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
