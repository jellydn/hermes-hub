import { createFileRoute, redirect } from "@tanstack/react-router";
import { Server, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCurrentSession } from "@/lib/session";

export const Route = createFileRoute("/dashboard")({
	beforeLoad: async ({ location }) => {
		const session = await getCurrentSession();

		if (!session) {
			throw redirect({
				to: "/login",
				search: { redirect: location.href },
			});
		}

		return { session };
	},
	component: DashboardPage,
});

function DashboardPage() {
	const { session } = Route.useRouteContext();

	return (
		<main className="page-wrap px-4 pb-10 pt-14">
			<section className="island-shell relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-12">
				<div className="pointer-events-none absolute -left-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.24),transparent_70%)]" />
				<p className="island-kicker mb-3">HermesHub Dashboard</p>
				<h1 className="display-title mb-4 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight text-[var(--sea-ink)] sm:text-5xl">
					Welcome back, {session.user.email}
				</h1>
				<p className="mb-8 max-w-2xl text-base text-[var(--sea-ink-soft)] sm:text-lg">
					Your workspace is authenticated and ready for the next setup steps.
					Connect your first VPS to start managing Hermes without touching the
					terminal.
				</p>
				<Button type="button">Connect your first VPS</Button>
			</section>

			<section className="mt-8 grid gap-4 md:grid-cols-3">
				{[
					{
						title: "Session Active",
						description:
							"Magic-link authentication is working for this account.",
						icon: ShieldCheck,
					},
					{
						title: "First Server Pending",
						description: "No VPS connected yet. Start by verifying SSH access.",
						icon: Server,
					},
					{
						title: "Next Up",
						description:
							"AI provider, Telegram, and install flow land in later stories.",
						icon: Sparkles,
					},
				].map(({ description, icon: Icon, title }) => (
					<article key={title} className="island-shell rounded-2xl p-5">
						<div className="mb-4 inline-flex rounded-2xl border border-[var(--chip-line)] bg-[var(--chip-bg)] p-3 text-[var(--sea-ink)]">
							<Icon className="h-5 w-5" />
						</div>
						<h2 className="mb-2 text-base font-semibold text-[var(--sea-ink)]">
							{title}
						</h2>
						<p className="m-0 text-sm text-[var(--sea-ink-soft)]">
							{description}
						</p>
					</article>
				))}
			</section>

			<section className="island-shell mt-8 rounded-2xl p-6">
				<p className="island-kicker mb-2">Empty State</p>
				<p className="m-0 text-base text-[var(--sea-ink-soft)]">
					Connect your first VPS to get started.
				</p>
			</section>
		</main>
	);
}
