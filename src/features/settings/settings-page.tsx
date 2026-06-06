import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/features/dashboard/app-shell";
import { cn } from "@/lib/utils";

import { McpSettings } from "./mcp-settings";
import { PersonaSettings } from "./persona-settings";

const settingsRouteApi = getRouteApi("/settings");

type SettingsTab = "persona" | "mcp";

export function SettingsPage() {
	const { session, personaSettings, mcpServers, telegramDeploy } =
		settingsRouteApi.useRouteContext();
	const [activeTab, setActiveTab] = useState<SettingsTab>("persona");

	return (
		<AppShell
			userEmail={session.user.email}
			title="Settings"
			description="Configure Hermes agent identity, MCP servers, and workspace preferences."
			kicker="Workspace"
		>
			<div className="mb-6 flex flex-wrap gap-2">
				<button
					type="button"
					onClick={() => setActiveTab("persona")}
					className={cn(
						"rounded-full border px-4 py-2 text-sm font-medium transition",
						activeTab === "persona"
							? "border-[var(--sea-ink)] bg-[var(--sea-ink)] text-white"
							: "border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink)]",
					)}
				>
					Persona
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("mcp")}
					className={cn(
						"rounded-full border px-4 py-2 text-sm font-medium transition",
						activeTab === "mcp"
							? "border-[var(--sea-ink)] bg-[var(--sea-ink)] text-white"
							: "border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink)]",
					)}
				>
					MCP Servers
				</button>
			</div>

			{activeTab === "persona" ? (
				<PersonaSettings
					initialSettings={personaSettings}
					telegramDeploy={telegramDeploy}
				/>
			) : (
				<McpSettings
					initialServers={mcpServers}
					telegramDeploy={telegramDeploy}
				/>
			)}
		</AppShell>
	);
}
