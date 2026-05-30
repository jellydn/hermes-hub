import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";

import { ServerDetail } from "@/features/servers/server-detail";
import type { ServerDetailSnapshot } from "@/lib/server-detail";
import { requireSession } from "@/lib/session";
import { useMountEffect } from "@/lib/use-mount-effect";
import { AppShell } from "./dashboard";

export const Route = createFileRoute("/servers/$id")({
	beforeLoad: async ({ location }) => {
		return { session: await requireSession(location.href) };
	},
	component: ServerDetailPage,
});

function ServerDetailPage() {
	const { session } = Route.useRouteContext();
	const { id } = Route.useParams();
	const navigate = Route.useNavigate();
	const [serverDetail, setServerDetail] = useState<ServerDetailSnapshot | null>(
		null,
	);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useMountEffect(() => {
		let isActive = true;

		void (async () => {
			try {
				const response = await fetch(`/api/servers/${id}`);
				const payload = (await response.json().catch(() => null)) as {
					error?: string;
					serverDetail?: ServerDetailSnapshot;
				} | null;

				if (!isActive) {
					return;
				}

				if (!response.ok || !payload?.serverDetail) {
					setError(payload?.error ?? "Unable to load this server.");
					setIsLoading(false);
					return;
				}

				setServerDetail(payload.serverDetail);
				setError(null);
			} catch {
				if (!isActive) {
					return;
				}

				setError("Unable to load this server.");
			} finally {
				if (isActive) {
					setIsLoading(false);
				}
			}
		})();

		return () => {
			isActive = false;
		};
	});

	return (
		<AppShell
			userEmail={session.user.email}
			title={
				serverDetail?.server.label
					? `Manage server · ${serverDetail.server.label}`
					: "Manage server"
			}
			description="Review the connected VPS, save SSH basics in place, run recovery actions with confirmation, and jump straight into install progress when you need it."
			kicker="Manage server"
		>
			{isLoading ? (
				<section className="island-shell rounded-[2rem] p-6 sm:p-8">
					<div className="inline-flex items-center gap-3 text-sm text-[var(--sea-ink-soft)]">
						<LoaderCircle className="h-4 w-4 animate-spin" />
						<span>Loading server detail...</span>
					</div>
				</section>
			) : error ? (
				<section className="island-shell rounded-[2rem] p-6 text-sm text-[var(--sea-ink-soft)] sm:p-8">
					{error}
				</section>
			) : serverDetail ? (
				<ServerDetail
					detail={serverDetail}
					onDetailChange={setServerDetail}
					onGoToInstall={(serverId) =>
						navigate({
							to: "/servers/$id/install",
							params: { id: serverId },
						})
					}
				/>
			) : null}
		</AppShell>
	);
}
