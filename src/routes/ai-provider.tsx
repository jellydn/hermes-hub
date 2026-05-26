import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/session";
import { AppShell } from "./dashboard";

export const Route = createFileRoute("/ai-provider")({
	beforeLoad: async ({ location }) => {
		return { session: await requireSession(location.href) };
	},
	component: AiProviderPage,
});

function AiProviderPage() {
	const { session } = Route.useRouteContext();

	return (
		<AppShell
			userEmail={session.user.email}
			title="AI Provider"
			description="OpenAI, Anthropic, and OpenRouter setup will live here once provider configuration is implemented."
			kicker="Model Access"
		>
			<section className="island-shell rounded-[2rem] p-6 sm:p-8">
				<p className="island-kicker mb-2">Reserved Space</p>
				<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					The dashboard shell already supports this page, so the provider form
					can drop in without rebuilding navigation later.
				</p>
			</section>
		</AppShell>
	);
}
