import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "#/features/dashboard/app-shell";
import { cn } from "#/lib/utils";
import { AgentSkills } from "./agent-skills";
import { McpSettings } from "./mcp-settings";
import { PersonaSettings } from "./persona-settings";

const settingsRouteApi = getRouteApi("/settings");

type SettingsTab = "persona" | "mcp" | "skills";

export function SettingsPage() {
	const {
		session,
		personaSettings,
		mcpServers,
		agentSkills,
		deploymentTargets,
	} = settingsRouteApi.useRouteContext();
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
				<button
					type="button"
					onClick={() => setActiveTab("skills")}
					className={cn(
						"rounded-full border px-4 py-2 text-sm font-medium transition",
						activeTab === "skills"
							? "border-[var(--sea-ink)] bg-[var(--sea-ink)] text-white"
							: "border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink)]",
					)}
				>
					Agent Skills
				</button>
			</div>

			{activeTab === "persona" && (
				<PersonaSettings
					initialSettings={personaSettings}
					deploymentTargets={deploymentTargets}
				/>
			)}
			{activeTab === "mcp" && (
				<McpSettings
					initialServers={mcpServers}
					deploymentTargets={deploymentTargets}
				/>
			)}
			{activeTab === "skills" && (
				<AgentSkills
					initialSkills={agentSkills}
					deploymentTargets={deploymentTargets}
				/>
			)}
		</AppShell>
	);
}
