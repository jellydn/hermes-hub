import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, LoaderCircle, Rocket } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
	const navigate = Route.useNavigate();
	const [submittedLabel, setSubmittedLabel] = useState<string | null>(null);
	const [connectedServer, setConnectedServer] =
		useState<ConnectedServer | null>(null);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const [installError, setInstallError] = useState<string | null>(null);
	const [isConnecting, setIsConnecting] = useState(false);
	const [isStartingInstall, setIsStartingInstall] = useState(false);

	async function handleConnect(draft: {
		label: string;
		host: string;
		port: string;
		username: string;
		authMethod: "password" | "ssh-key";
		password: string;
		privateKey: string;
		storeCredential: boolean;
	}) {
		setIsConnecting(true);
		setConnectionError(null);
		setInstallError(null);

		try {
			const response = await fetch("/api/servers/connect", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					label: draft.label,
					host: draft.host,
					port: Number(draft.port),
					username: draft.username,
					authMethod: draft.authMethod,
					storeCredential: draft.storeCredential,
					...(draft.authMethod === "password"
						? { password: draft.password }
						: { privateKey: draft.privateKey }),
				}),
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				server?: ConnectedServer;
			} | null;

			if (!response.ok || !payload?.server) {
				setConnectedServer(null);
				setConnectionError(payload?.error ?? "Unable to verify this server.");
				return;
			}

			setConnectedServer(payload.server);
			setSubmittedLabel(payload.server.label);
		} finally {
			setIsConnecting(false);
		}
	}

	async function handleInstall() {
		if (!connectedServer) {
			return;
		}

		setIsStartingInstall(true);
		setInstallError(null);

		try {
			const response = await fetch(
				`/api/servers/${connectedServer.id}/install`,
				{
					method: "POST",
				},
			);
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
			} | null;

			if (!response.ok) {
				if (response.status === 409) {
					await navigate({
						to: "/servers/$id/install",
						params: { id: connectedServer.id },
					});
					return;
				}

				setInstallError(payload?.error ?? "Unable to start the install.");
				return;
			}

			await navigate({
				to: "/servers/$id/install",
				params: { id: connectedServer.id },
			});
		} finally {
			setIsStartingInstall(false);
		}
	}

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
						<li>Install progress resumes from the latest SSE replay.</li>
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
					{connectionError ? (
						<div className="mt-5 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-[var(--sea-ink)]">
							<div className="mb-2 inline-flex rounded-full bg-white/70 p-2 text-red-600">
								<AlertCircle className="h-4 w-4" />
							</div>
							<p className="m-0 font-semibold">Connection failed</p>
							<p className="mt-1 mb-0 text-[var(--sea-ink-soft)]">
								{connectionError}
							</p>
						</div>
					) : null}
				</aside>
			</section>

			<ConnectionWizard onSubmit={handleConnect} isSubmitting={isConnecting} />

			{connectedServer ? (
				<section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
					<div className="island-shell rounded-[2rem] p-6 sm:p-8">
						<p className="island-kicker mb-2">Verified server</p>
						<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
							{connectedServer.label} is ready for install
						</h3>
						<p className="mt-3 mb-6 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
							SSH verification passed. Start the Hermes install to open the live
							progress page with streaming logs.
						</p>

						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
							<SummaryCard label="Host" value={connectedServer.host} />
							<SummaryCard label="User" value={connectedServer.username} />
							<SummaryCard
								label="OS"
								value={formatOsSummary(connectedServer.osInfo)}
							/>
							<SummaryCard label="Status" value={connectedServer.status} />
						</div>

						{installError ? (
							<div className="mt-5 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
								{installError}
							</div>
						) : null}

						<div className="mt-6 flex flex-wrap items-center gap-3">
							<Button
								type="button"
								onClick={() => {
									void handleInstall();
								}}
								disabled={isStartingInstall}
							>
								{isStartingInstall ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : (
									<Rocket className="h-4 w-4" />
								)}
								<span>
									{isStartingInstall ? "Starting install..." : "Install Hermes"}
								</span>
							</Button>
							<Button
								type="button"
								variant="secondary"
								onClick={() => {
									void navigate({
										to: "/servers/$id",
										params: { id: connectedServer.id },
									});
								}}
							>
								Manage Server
							</Button>
						</div>
					</div>

					<aside className="island-shell rounded-[2rem] p-6">
						<p className="island-kicker mb-2">What happens next</p>
						<ul className="m-0 space-y-3 pl-5 text-sm text-[var(--sea-ink-soft)]">
							<li>Docker and Docker Compose are installed over SSH.</li>
							<li>Hermes files are written into `~/hermes` on the VPS.</li>
							<li>The install page streams logs and stays resumable.</li>
						</ul>
					</aside>
				</section>
			) : null}
		</AppShell>
	);
}

type ConnectedServer = {
	id: string;
	label: string;
	host: string;
	port: number;
	username: string;
	status: string;
	osInfo?: {
		name?: string;
		version?: string;
		architecture?: string;
	};
};

function SummaryCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4">
			<p className="island-kicker mb-2">{label}</p>
			<p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">{value}</p>
		</div>
	);
}

function formatOsSummary(osInfo?: ConnectedServer["osInfo"]) {
	if (!osInfo?.name) {
		return "Verified";
	}

	return [osInfo.name, osInfo.version, osInfo.architecture]
		.filter(Boolean)
		.join(" • ");
}
