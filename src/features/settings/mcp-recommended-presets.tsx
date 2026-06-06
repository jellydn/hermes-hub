import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { McpServerSummary } from "../../../server/settings/mcp/config";

import {
	findSavedPresetServer,
	MCP_SERVER_PRESETS,
	type McpServerPreset,
} from "./mcp-server-presets";

type McpRecommendedPresetsProps = {
	servers: McpServerSummary[];
	configuringPresetId: string | null;
	onConfigure: (preset: McpServerPreset) => void;
	onEditSaved: (server: McpServerSummary) => void;
};

export function McpRecommendedPresets({
	servers,
	configuringPresetId,
	onConfigure,
	onEditSaved,
}: McpRecommendedPresetsProps) {
	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-6">
				<p className="island-kicker m-0">Recommended MCP servers</p>
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					Start with a curated preset
				</h3>
				<p className="m-0 mt-2 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					Choose a beginner-friendly MCP server, save it to HermesHub, then
					deploy MCP settings to install it on your VPS.
				</p>
			</div>

			<ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
				{MCP_SERVER_PRESETS.map((preset) => {
					const savedServer = findSavedPresetServer(servers, preset);
					const isConfiguring = configuringPresetId === preset.id;

					return (
						<li
							key={preset.id}
							className="flex h-full flex-col rounded-[1.25rem] border border-[var(--line)] p-4"
						>
							<div className="flex-1">
								<div className="flex items-start justify-between gap-2">
									<p className="m-0 font-semibold text-[var(--sea-ink)]">
										{preset.title}
									</p>
									{savedServer ? (
										<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700">
											<Check className="h-3.5 w-3.5" />
											Saved
										</span>
									) : null}
								</div>
								<p className="m-0 mt-2 text-sm text-[var(--sea-ink-soft)]">
									{preset.description}
								</p>
							</div>

							<div className="mt-4">
								{savedServer ? (
									<Button
										type="button"
										variant="secondary"
										onClick={() => onEditSaved(savedServer)}
									>
										Edit saved server
									</Button>
								) : (
									<Button
										type="button"
										onClick={() => onConfigure(preset)}
										disabled={isConfiguring}
									>
										{isConfiguring ? "Configuring..." : "Configure"}
									</Button>
								)}
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
