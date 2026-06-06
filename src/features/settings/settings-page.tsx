import { getRouteApi } from "@tanstack/react-router";

import { AppShell } from "@/features/dashboard/app-shell";

import { PersonaSettings } from "./persona-settings";

const settingsRouteApi = getRouteApi("/settings");

export function SettingsPage() {
	const { session, personaSettings, telegramDeploy } =
		settingsRouteApi.useRouteContext();

	return (
		<AppShell
			userEmail={session.user.email}
			title="Settings"
			description="Configure Hermes agent identity and workspace preferences."
			kicker="Workspace"
		>
			<PersonaSettings
				initialSettings={personaSettings}
				telegramDeploy={telegramDeploy}
			/>
		</AppShell>
	);
}
