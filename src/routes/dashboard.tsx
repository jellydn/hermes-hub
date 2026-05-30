import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import {
	Bot,
	LayoutDashboard,
	LogOut,
	Logs,
	Menu,
	Server,
	Settings,
	Sparkles,
	X,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { DashboardStatusOverview } from "@/features/dashboard/status-overview";
import { authClient } from "@/lib/auth-client";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getAuthSession } from "../../server/auth";
import { getDashboardStatusSnapshot } from "../../server/dashboard";

const loadDashboardStatus = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getAuthSession(getRequestHeaders());
		if (!session) {
			return null;
		}

		return getDashboardStatusSnapshot({
			userId: session.user.id,
			sessionId: session.session.id,
		});
	},
);

export const Route = createFileRoute("/dashboard")({
	beforeLoad: async ({ location }) => {
		const session = await requireSession(location.href);
		const dashboardStatus = await loadDashboardStatus();

		return { session, dashboardStatus };
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
	actions?: ReactNode;
	children: ReactNode;
};

export function AppShell({
	actions,
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
		<main className="w-full max-w-none px-4 sm:px-6 lg:px-8 pb-10 pt-8 lg:pt-10">
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
							aria-expanded={isSidebarOpen}
							aria-controls="sidebar-nav"
						>
							{isSidebarOpen ? (
								<X className="h-4 w-4" aria-hidden="true" />
							) : (
								<Menu className="h-4 w-4" aria-hidden="true" />
							)}
							<span>{isSidebarOpen ? "Close" : "Menu"}</span>
						</Button>
					</div>

					<div
						id="sidebar-nav"
						className={cn(
							"island-shell overflow-hidden rounded-[2rem] p-4",
							isSidebarOpen ? "block" : "hidden lg:block",
						)}
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
									<Icon className="h-4 w-4" aria-hidden="true" />
									<span>{label}</span>
								</Link>
							))}
						</nav>

						<div className="mt-6 rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] p-4">
							<div className="flex items-center justify-between gap-3">
								<div className="min-w-0 flex-1">
									<p className="island-kicker mb-1">Signed In</p>
									<p
										className="truncate text-sm font-medium text-[var(--sea-ink)]"
										title={userEmail}
									>
										{userEmail}
									</p>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="h-8 w-8 shrink-0 text-[var(--sea-ink-soft)] hover:bg-[var(--chip-line)] hover:text-[var(--sea-ink)]"
									onClick={() => {
										void handleLogout();
									}}
									aria-label="Log out"
								>
									<LogOut className="h-4 w-4" aria-hidden="true" />
								</Button>
							</div>
						</div>
					</div>
				</aside>

				<section className="space-y-6 min-w-0">
					<div className="island-shell rounded-[2rem] px-6 py-6 sm:px-8">
						<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div className="min-w-0">
								<p className="island-kicker mb-2">{kicker}</p>
								<h2 className="display-title m-0 text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
									{title}
								</h2>
								<p className="mt-3 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
									{description}
								</p>
							</div>

							<div className="flex flex-wrap items-center gap-3 lg:justify-end">
								{actions}
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={() => {
										void handleLogout();
									}}
								>
									<LogOut className="h-4 w-4" aria-hidden="true" />
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
	const { dashboardStatus, session } = Route.useRouteContext();
	const serverCount = dashboardStatus?.serverCount ?? 0;

	return (
		<AppShell
			userEmail={session.user.email}
			title="Mission control"
			description="Track Hermes health, confirm the VPS is still responsive, and see whether provider and Telegram integrations are ready without leaving the dashboard."
			kicker="Dashboard"
			actions={
				<Button asChild size="sm">
					<a href="/servers">
						<span>Servers {serverCount > 0 ? `(${serverCount})` : ""}</span>
					</a>
				</Button>
			}
		>
			<DashboardStatusOverview initialStatus={dashboardStatus ?? null} />
		</AppShell>
	);
}
