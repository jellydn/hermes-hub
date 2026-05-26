import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { ConnectionWizard } from "@/features/servers/connection-wizard";
import { requireSession } from "@/lib/session";

import { AppShell } from "./dashboard";

export const Route = createFileRoute("/servers")({
	beforeLoad: async ({ location }) => {
		return { session: await requireSession(location.href) };
	},
	component: ServersPage,
});

function ServersPage() {
	const { session } = Route.useRouteContext();
	const [submittedLabel, setSubmittedLabel] = useState<string | null>(null);

	return (
		<AppShell
			userEmail={session.user.email}
			title="Servers"
			description="Walk through the first-time VPS connection flow, validate the SSH details, and hand a clean payload to the backend connection step."
			kicker="Infrastructure"
		>
			<section className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<div className="island-shell rounded-[2rem] p-6 sm:p-8">
					<p className="island-kicker mb-2">Connection plan</p>
					<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
						Guide one secure SSH connection from details to review.
					</h3>
					<p className="mt-3 mb-0 max-w-3xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
						This wizard keeps the form local until submission, validates the
						host and port before moving on, and prepares the payload the SSH
						verification API will consume next.
					</p>
				</div>

				<aside className="island-shell rounded-[2rem] p-6">
					<p className="island-kicker mb-2">Readiness</p>
					<ul className="m-0 space-y-3 pl-5 text-sm text-[var(--sea-ink-soft)]">
						<li>Label, host, port, and username are required.</li>
						<li>Password and SSH key paths stay conditional.</li>
						<li>Credentials are only handed off when you press Connect.</li>
					</ul>
					{submittedLabel ? (
						<div className="mt-5 rounded-[1.5rem] border border-[rgba(47,106,74,0.18)] bg-[rgba(47,106,74,0.08)] px-4 py-4 text-sm text-[var(--sea-ink)]">
							<div className="mb-2 inline-flex rounded-full bg-white/70 p-2 text-[var(--palm)]">
								<CheckCircle2 className="h-4 w-4" />
							</div>
							<p className="m-0 font-semibold">Connection draft ready</p>
							<p className="mt-1 mb-0 text-[var(--sea-ink-soft)]">
								{submittedLabel} is ready for backend verification.
							</p>
						</div>
					) : null}
				</aside>
			</section>

			<ConnectionWizard
				onSubmit={(draft) => {
					setSubmittedLabel(draft.label);
				}}
			/>
		</AppShell>
	);
}
