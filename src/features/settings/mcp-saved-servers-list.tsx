import { Trash2 } from "lucide-react";
import type { McpServerSummary } from "#server/settings/mcp/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type McpSavedServersListProps = {
	servers: McpServerSummary[];
	editingId: string | null;
	isDeleting: boolean;
	onEdit: (server: McpServerSummary) => void;
	onDelete: (serverId: string) => void;
};

export function McpSavedServersList({
	servers,
	editingId,
	isDeleting,
	onEdit,
	onDelete,
}: McpSavedServersListProps) {
	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-6">
				<p className="island-kicker m-0">Saved servers</p>
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					Your MCP servers
				</h3>
			</div>

			{servers.length === 0 ? (
				<p className="m-0 text-sm text-[var(--sea-ink-soft)]">
					No MCP servers saved yet. Configure a recommended preset above.
				</p>
			) : (
				<ul className="m-0 list-none space-y-3 p-0">
					{servers.map((server) => (
						<li
							key={server.id}
							className={cn(
								"rounded-[1.25rem] border border-[var(--line)] p-4",
								editingId === server.id && "border-[var(--sea-ink-soft)]",
							)}
						>
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p className="m-0 font-semibold text-[var(--sea-ink)]">
										{server.name}
									</p>
									<p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">
										{server.transport.toUpperCase()} ·{" "}
										{server.enabled ? "Enabled" : "Disabled"}
									</p>
								</div>
								<div className="flex flex-wrap gap-2">
									<Button
										type="button"
										variant="secondary"
										onClick={() => onEdit(server)}
									>
										Edit
									</Button>
									<Button
										type="button"
										variant="secondary"
										onClick={() => onDelete(server.id)}
										disabled={isDeleting}
									>
										<Trash2 className="h-4 w-4" />
										<span>Delete</span>
									</Button>
								</div>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
