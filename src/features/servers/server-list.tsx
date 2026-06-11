import { Link } from "@tanstack/react-router";
import { ArrowRight, Plus, Rocket, Server } from "lucide-react";

import { Button } from "#/components/ui/button";
import { StatusIcon } from "#/components/ui/status-icon";
import type { ServerListSummary } from "#/lib/servers";
import { getStatusPillClassName, getStatusPillType } from "#/lib/status-pill";

import { formatInstallStatus, formatTimestamp } from "./server-detail-helpers";

type ServerListProps = {
	servers: ServerListSummary[];
};

export function ServerList({ servers }: ServerListProps) {
	if (servers.length === 0) {
		return (
			<section className="island-shell rounded-[2rem] p-6 sm:p-8">
				<p className="island-kicker mb-2">No servers yet</p>
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					Add your first server
				</h3>
				<p className="mt-3 mb-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					Start a new connection draft to verify SSH access, save the basics,
					and launch the Hermes install flow from one place.
				</p>
				<Button asChild className="mt-6">
					<Link to="/servers/new">
						<Plus className="h-4 w-4" />
						<span>Add your first server</span>
					</Link>
				</Button>
			</section>
		);
	}

	return (
		<section className="grid gap-4 xl:grid-cols-2" aria-label="Server list">
			{servers.map((server) => (
				<article
					key={server.id}
					className="island-shell rounded-[2rem] p-6 sm:p-8"
				>
					<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
						<div>
							<p className="island-kicker mb-2">Managed server</p>
							<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
								{server.label}
							</h3>
							<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)] sm:text-base">
								{server.host}
								{formatOsSummary(server) ? ` · ${formatOsSummary(server)}` : ""}
							</p>
						</div>
						<span className={getStatusPillClassName(server.status)}>
							<StatusIcon
								status={getStatusPillType(server.status)}
								size={3.5}
							/>
							{server.status}
						</span>
					</div>

					<div className="mt-6 grid gap-3 sm:grid-cols-3">
						<SummaryStat
							label="Install"
							value={
								server.installStatus
									? formatInstallStatus(server.installStatus)
									: "Not started"
							}
						/>
						<SummaryStat
							label="Support"
							value={
								server.supportLevel === "untested" ? "Untested" : "Supported"
							}
						/>
						<SummaryStat
							label="Last action"
							value={
								server.lastActionAt
									? formatTimestamp(server.lastActionAt)
									: "No actions yet"
							}
						/>
					</div>

					<p className="mt-4 mb-0 text-sm text-[var(--sea-ink-soft)]">
						Last activity: {formatTimestamp(server.lastActivityAt)}
					</p>

					<div className="mt-6 flex flex-wrap items-center gap-3">
						<Button asChild>
							<Link to="/servers/$id" params={{ id: server.id }}>
								<Server className="h-4 w-4" />
								<span>Manage server</span>
							</Link>
						</Button>
						<Button asChild variant="secondary">
							<Link to="/servers/$id/install" params={{ id: server.id }}>
								<Rocket className="h-4 w-4" />
								<span>Install</span>
							</Link>
						</Button>
						<Button asChild variant="ghost">
							<Link to="/servers/$id" params={{ id: server.id }}>
								<span>Open details</span>
								<ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
					</div>
				</article>
			))}
		</section>
	);
}

function SummaryStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4">
			<p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sea-ink-soft)]">
				{label}
			</p>
			<p className="mt-2 mb-0 text-sm font-semibold text-[var(--sea-ink)]">
				{value}
			</p>
		</div>
	);
}

function formatOsSummary(
	server: Pick<ServerListSummary, "osName" | "osVersion">,
) {
	return [server.osName, server.osVersion].filter(Boolean).join(" ");
}
