import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
	ArrowRight,
	BadgeCheck,
	Bot,
	CheckCircle2,
	Download,
	ExternalLink,
	KeyRound,
	RefreshCw,
	Server,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { hermesCommunitySiteUrl } from "@/lib/hermes-community";
import { getCurrentSession } from "@/lib/session";

const launchPillars = [
	"Ubuntu 22.04+ and Debian 12+ support",
	"Live install progress and logs",
	"OpenAI, Anthropic, and OpenRouter",
	"Telegram and dashboard access",
] as const;

const setupSteps = [
	{
		icon: Server,
		title: "Connect your VPS",
		description:
			"Enter the host, port, username, and either a password or SSH key. HermesHub verifies access first so you know the server is ready.",
	},
	{
		icon: Download,
		title: "Install Hermes",
		description:
			"Kick off the guided install and watch Docker, Compose, config, and startup steps stream live instead of guessing what happened.",
	},
	{
		icon: KeyRound,
		title: "Add your AI provider",
		description:
			"Paste an OpenAI, Anthropic, or OpenRouter key, choose the model, and verify the connection before you go live.",
	},
	{
		icon: Bot,
		title: "Connect Telegram",
		description:
			"Finish with the Telegram wizard so your Hermes agent is reachable from chat right away, not buried behind server setup work.",
	},
] as const;

const operatorBenefits = [
	{
		icon: ShieldCheck,
		title: "Safer credential handling",
		description:
			"Store SSH and provider secrets encrypted, or keep server credentials ephemeral for a session-only workflow.",
	},
	{
		icon: Sparkles,
		title: "Purpose-built for Hermes Agent",
		description:
			"HermesHub is not a generic VPS panel. It is tuned for the Hermes Agent setup path, provider wiring, and Telegram onboarding.",
	},
	{
		icon: RefreshCw,
		title: "Day-two controls included",
		description:
			"Restart, update, and rollback from the dashboard with audit history so ongoing operations stay as simple as first-time setup.",
	},
] as const;

const launchChecklist = [
	"Magic-link sign in for non-technical users",
	"OS compatibility checks before install",
	"SSE progress updates with step-by-step logs",
	"One-click restart, update, and rollback controls",
] as const;

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{
				title: "HermesHub — Deploy Hermes Agent without the terminal",
			},
			{
				name: "description",
				content:
					"HermesHub helps non-technical users deploy Hermes Agent to a VPS with guided install, live progress, provider setup, and Telegram onboarding.",
			},
		],
	}),
	beforeLoad: async () => {
		const session = await getCurrentSession();

		if (session) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: App,
});

const communityTextLinkClassName =
	"font-semibold text-[var(--sea-ink)] underline decoration-[var(--chip-line)] underline-offset-4";

function HermesCommunityTextLink({ children }: { children: ReactNode }) {
	return (
		<a
			href={hermesCommunitySiteUrl}
			target="_blank"
			rel="noopener noreferrer"
			className={communityTextLinkClassName}
		>
			{children}
		</a>
	);
}

function App() {
	return (
		<main className="page-wrap px-4 pb-12 pt-14">
			<section className="island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
				<div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.32),transparent_66%)]" />
				<div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(47,106,74,0.18),transparent_66%)]" />

				<div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_360px] lg:items-start">
					<div>
						<p className="island-kicker mb-3">Powered by Hermes Agent</p>
						<h1 className="display-title mb-5 max-w-4xl text-4xl leading-[1.02] font-bold tracking-tight text-[var(--sea-ink)] sm:text-6xl">
							Your personal AI agent in 5 minutes. Zero terminal required.
						</h1>
						<p className="max-w-2xl text-base text-[var(--sea-ink-soft)] sm:text-lg">
							HermesHub is the VPS setup and control layer: connect a server,
							verify compatibility, install Hermes with live progress, wire your
							AI provider, and manage restart, update, and rollback from one
							dashboard. For the browser-based Hermes Web UI, see{" "}
							<HermesCommunityTextLink>get-hermes.ai</HermesCommunityTextLink>.
						</p>

						<div className="mt-8 flex flex-wrap gap-3">
							<Button asChild>
								<Link to="/login">
									Start your install
									<ArrowRight />
								</Link>
							</Button>
							<Button asChild variant="secondary">
								<a href="#how-it-works">
									See how it works
									<BadgeCheck />
								</a>
							</Button>
							<Button asChild variant="secondary">
								<a
									href={hermesCommunitySiteUrl}
									target="_blank"
									rel="noopener noreferrer"
								>
									Explore Hermes
									<ExternalLink />
								</a>
							</Button>
						</div>

						<ul className="mt-8 grid gap-3 text-sm text-[var(--sea-ink-soft)] sm:grid-cols-2">
							{launchPillars.map((pillar) => (
								<li
									key={pillar}
									className="flex items-start gap-2 rounded-2xl border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-3"
								>
									<CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[var(--lagoon-deep)]" />
									<span>{pillar}</span>
								</li>
							))}
						</ul>
					</div>

					<aside className="island-shell feature-card rounded-[1.75rem] p-5 sm:p-6">
						<p className="island-kicker mb-2">What HermesHub handles</p>
						<h2 className="text-xl font-semibold text-[var(--sea-ink)]">
							From fresh VPS to working agent
						</h2>
						<p className="mt-3 text-sm leading-6 text-[var(--sea-ink-soft)]">
							Hermes Agent is powerful because it lives on your own server.
							HermesHub removes the setup tax so more people can actually use
							it.
						</p>
						<ul className="mt-5 space-y-3 text-sm text-[var(--sea-ink-soft)]">
							{launchChecklist.map((item) => (
								<li key={item} className="flex items-start gap-3">
									<span className="mt-1 h-2.5 w-2.5 rounded-full bg-[linear-gradient(90deg,var(--lagoon),#7ed3bf)]" />
									<span>{item}</span>
								</li>
							))}
						</ul>
					</aside>
				</div>
			</section>

			<section id="how-it-works" className="mt-8 space-y-4">
				<div className="island-shell rounded-[2rem] px-6 py-6 sm:px-8">
					<p className="island-kicker mb-2">How it works</p>
					<h2 className="display-title text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
						A guided path from server access to first chat.
					</h2>
					<p className="mt-3 max-w-3xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
						The{" "}
						<HermesCommunityTextLink>
							community Hermes site
						</HermesCommunityTextLink>{" "}
						shows what the agent can become. HermesHub is the onboarding layer
						that gets users there without SSH, Docker, or Linux guesswork.
					</p>
				</div>

				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					{setupSteps.map(({ description, icon: Icon, title }, index) => (
						<article
							key={title}
							className="island-shell feature-card rise-in rounded-[2rem] p-5"
							style={{ animationDelay: `${index * 90 + 80}ms` }}
						>
							<div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--lagoon-deep)]">
								<Icon className="h-5 w-5" />
							</div>
							<p className="island-kicker mb-2">Step {index + 1}</p>
							<h3 className="mb-2 text-lg font-semibold text-[var(--sea-ink)]">
								{title}
							</h3>
							<p className="m-0 text-sm leading-6 text-[var(--sea-ink-soft)]">
								{description}
							</p>
						</article>
					))}
				</div>
			</section>

			<section className="island-shell mt-8 rounded-[2rem] px-6 py-8 sm:px-8">
				<div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
					<div>
						<p className="island-kicker mb-2">HermesHub + Hermes Web UI</p>
						<h2 className="display-title text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
							Set up on HermesHub, use Hermes in the browser.
						</h2>
						<p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--sea-ink-soft)] sm:text-base">
							HermesHub handles the VPS work: connect your server, watch install
							progress, deploy your AI provider, finish Telegram setup, and
							manage restart, update, and rollback from one dashboard.
						</p>
						<p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--sea-ink-soft)] sm:text-base">
							After setup, the Hermes Web UI described on{" "}
							<HermesCommunityTextLink>get-hermes.ai</HermesCommunityTextLink>{" "}
							is the browser interface for using Hermes day to day — sessions,
							chat, workspace files, and tool calls in a three-panel layout.
						</p>
					</div>

					<div className="rounded-[1.75rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] p-5">
						<p className="island-kicker mb-3">What each tool does</p>
						<ul className="space-y-4 text-sm text-[var(--sea-ink-soft)]">
							<li>
								<p className="mb-1 font-semibold text-[var(--sea-ink)]">
									HermesHub
								</p>
								<p className="m-0 leading-6">
									VPS setup, install progress, provider deploy, Telegram
									onboarding, and day-two server controls.
								</p>
							</li>
							<li>
								<p className="mb-1 font-semibold text-[var(--sea-ink)]">
									Hermes Web UI
								</p>
								<p className="m-0 leading-6">
									The browser interface for chatting with Hermes, browsing
									sessions, and working with files after your agent is running.
								</p>
							</li>
						</ul>
						<Button
							asChild
							variant="secondary"
							className="mt-5 w-full sm:w-auto"
						>
							<a
								href={hermesCommunitySiteUrl}
								target="_blank"
								rel="noopener noreferrer"
							>
								Visit the Hermes community site
								<ExternalLink />
							</a>
						</Button>
					</div>
				</div>
			</section>

			<section className="mt-8 grid gap-4 lg:grid-cols-3">
				{operatorBenefits.map(({ description, icon: Icon, title }, index) => (
					<article
						key={title}
						className="island-shell rounded-[2rem] p-6"
						style={{ animationDelay: `${index * 80 + 120}ms` }}
					>
						<div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--lagoon-deep)]">
							<Icon className="h-5 w-5" />
						</div>
						<h2 className="mb-2 text-lg font-semibold text-[var(--sea-ink)]">
							{title}
						</h2>
						<p className="m-0 text-sm leading-6 text-[var(--sea-ink-soft)]">
							{description}
						</p>
					</article>
				))}
			</section>

			<section className="island-shell mt-8 rounded-[2rem] px-6 py-8 sm:px-8">
				<div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
					<div>
						<p className="island-kicker mb-2">Why this landing page exists</p>
						<h2 className="display-title text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
							HermesHub makes Hermes Agent approachable without diluting what
							makes Hermes special.
						</h2>
						<p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--sea-ink-soft)] sm:text-base">
							Hermes Agent is the open-source personal agent that lives on your
							own server and grows with you. HermesHub focuses on the MVP
							workflow from the PRD: connect a VPS, install with confidence, add
							a provider, connect Telegram, and manage the running agent from a
							clean dashboard.
						</p>
					</div>

					<div className="rounded-[1.75rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-5 py-5">
						<p className="island-kicker mb-3">Built into the MVP</p>
						<ul className="space-y-3 text-sm text-[var(--sea-ink-soft)]">
							<li className="flex items-start gap-3">
								<CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[var(--lagoon-deep)]" />
								<span>
									Real-time install progress so users never stare at a blank
									screen.
								</span>
							</li>
							<li className="flex items-start gap-3">
								<CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[var(--lagoon-deep)]" />
								<span>
									Provider setup for OpenAI, Anthropic, and OpenRouter.
								</span>
							</li>
							<li className="flex items-start gap-3">
								<CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[var(--lagoon-deep)]" />
								<span>Telegram connection flow for immediate chat access.</span>
							</li>
							<li className="flex items-start gap-3">
								<CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[var(--lagoon-deep)]" />
								<span>
									One-click restart, update, and rollback once the agent is
									live.
								</span>
							</li>
						</ul>
					</div>
				</div>
			</section>

			<section className="island-shell mt-8 rounded-[2rem] px-6 py-8 sm:px-8">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<p className="island-kicker mb-2">Ready to launch</p>
						<h2 className="display-title text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
							Get Hermes Agent running without living in the terminal.
						</h2>
						<p className="mt-3 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
							Start with a magic link, connect your VPS, and let HermesHub
							handle the installation workflow.
						</p>
					</div>

					<div className="flex flex-wrap gap-3">
						<Button asChild>
							<Link to="/login">
								Get started
								<ArrowRight />
							</Link>
						</Button>
						<Button asChild variant="secondary">
							<a
								href={hermesCommunitySiteUrl}
								target="_blank"
								rel="noopener noreferrer"
							>
								Explore the Hermes community site
								<ExternalLink />
							</a>
						</Button>
					</div>
				</div>
			</section>
		</main>
	);
}
