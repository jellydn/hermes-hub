import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Bot,
	LayoutDashboard,
	LogOut,
	Logs,
	Menu,
	Server,
	Settings,
	ShieldCheck,
	Sparkles,
	X,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { requireSession } from "@/lib/session";

export const Route = createFileRoute("/dashboard")({
	beforeLoad: async ({ location }) => {
		return { session: await requireSession(location.href) };
	},
	component: DashboardPage,
});

const appNavigation = [
	{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ to: "/servers", label: "Servers", icon: Server },
	{ to: "/ai-provider", label: "AI Provider", icon: Sparkles },
	{ to: "/telegram", label: "Telegram", icon: Bot },
	{ to: "/logs", label: "Logs", icon: Logs },
	{ to: "/settings", label: "Settings", icon: Settings },
] as const;

type AppShellProps = {
	userEmail: string;
	title: string;
	description: string;
	kicker: string;
	children: ReactNode;
};

export function AppShell({
	children,
	description,
	kicker,
	title,
	userEmail,
}: AppShellProps) {
	const navigate = Route.useNavigate();
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);

	async function handleLogout() {
		await authClient.signOut();
		await navigate({ to: "/login" });
	}

	return (
		<main className="page-wrap px-4 pb-10 pt-8 lg:pt-10">
			<div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
				<aside className="space-y-4 lg:sticky lg:top-24">
					<div className="island-shell flex items-center justify-between rounded-[1.75rem] px-5 py-4 lg:hidden">
						<div>
							<p className="island-kicker mb-1">Workspace Menu</p>
							<p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
								HermesHub navigation
							</p>
						</div>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() => setIsSidebarOpen((open) => !open)}
						>
							{isSidebarOpen ? (
								<X className="h-4 w-4" />
							) : (
								<Menu className="h-4 w-4" />
							)}
							<span>{isSidebarOpen ? "Close" : "Menu"}</span>
						</Button>
					</div>

					<div
						className={[
							"island-shell overflow-hidden rounded-[2rem] p-4",
							isSidebarOpen ? "block" : "hidden lg:block",
						].join(" ")}
					>
						<div className="border-b border-[var(--line)] px-2 pb-4">
							<p className="island-kicker mb-2">HermesHub</p>
							<h1 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
								Zero-terminal ops for your Hermes agent
							</h1>
						</div>

						<nav className="mt-4 space-y-1.5" aria-label="Sidebar">
							{appNavigation.map(({ icon: Icon, label, to }) => (
								<Link
									key={to}
									to={to}
									onClick={() => setIsSidebarOpen(false)}
									className="dashboard-nav-link"
									activeProps={{ className: "dashboard-nav-link is-active" }}
								>
									<Icon className="h-4 w-4" />
									<span>{label}</span>
								</Link>
							))}
						</nav>

						<div className="mt-6 rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4">
							<p className="island-kicker mb-2">Signed In</p>
							<p className="m-0 text-sm font-medium text-[var(--sea-ink)]">
								{userEmail}
							</p>
						</div>
					</div>
				</aside>

				<section className="space-y-6">
					<div className="island-shell rounded-[2rem] px-6 py-6 sm:px-8">
						<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div>
								<p className="island-kicker mb-2">{kicker}</p>
								<h2 className="display-title m-0 text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
									{title}
								</h2>
								<p className="mt-3 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
									{description}
								</p>
							</div>

							<div className="flex flex-wrap items-center gap-3 lg:justify-end">
								<div className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm text-[var(--sea-ink)]">
									{userEmail}
								</div>
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={() => {
										void handleLogout();
									}}
								>
									<LogOut className="h-4 w-4" />
									<span>Log out</span>
								</Button>
							</div>
						</div>
					</div>

					<div>{children}</div>
				</section>
			</div>
		</main>
	);
}

function DashboardPage() {
	const { session } = Route.useRouteContext();

	return (
		<AppShell
			userEmail={session.user.email}
			title="Welcome back"
			description="Your authenticated workspace is ready. Connect your first VPS to unlock installs, provider setup, and Telegram control from one place."
			kicker="Dashboard"
		>
			<section className="island-shell relative overflow-hidden rounded-[2rem] px-6 py-8 sm:px-8">
				<div className="pointer-events-none absolute -left-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.24),transparent_70%)]" />
				<div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
					<div>
						<p className="island-kicker mb-3">Authenticated Session</p>
						<h3 className="display-title mb-3 text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
							{session.user.email}
						</h3>
						<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
							This dashboard will become the command center for your Hermes
							deployment. Right now the next milestone is connecting the first
							VPS.
						</p>
					</div>
					<Button asChild>
						<Link to="/servers">Connect your first VPS</Link>
					</Button>
				</div>
			</section>

			<section className="grid gap-4 md:grid-cols-3">
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
						<h3 className="mb-2 text-base font-semibold text-[var(--sea-ink)]">
							{title}
						</h3>
						<p className="m-0 text-sm text-[var(--sea-ink-soft)]">
							{description}
						</p>
					</article>
				))}
			</section>

			<section className="island-shell rounded-2xl p-6">
				<p className="island-kicker mb-2">Empty State</p>
				<p className="m-0 text-base text-[var(--sea-ink-soft)]">
					Connect your first VPS to get started.
				</p>
			</section>
		</AppShell>
	);
}
