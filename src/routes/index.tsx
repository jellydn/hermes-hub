import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
	Activity,
	ArrowRight,
	Bot,
	Download,
	ExternalLink,
	Globe,
	KeyRound,
	MessageCircle,
	RefreshCw,
	Server,
	Settings,
	ShieldCheck,
	Sparkles,
	Terminal,
	Wrench,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { getCurrentSession } from "@/lib/session";

const githubRepoUrl = "https://github.com/jellydn/hermes-hub";

const setupPainPoints = [
	{ icon: KeyRound, label: "SSH keys" },
	{ icon: Terminal, label: "Docker" },
	{ icon: Settings, label: "Environment variables" },
	{ icon: Sparkles, label: "Provider configuration" },
	{ icon: Bot, label: "Telegram setup" },
] as const;

const setupSteps = [
	{
		icon: Server,
		title: "Connect your VPS",
		description:
			"Enter your server details and let HermesHub verify access before anything else runs.",
	},
	{
		icon: Download,
		title: "Install Hermes",
		description:
			"Kick off a guided install and watch each step stream live instead of guessing in a terminal.",
	},
	{
		icon: Sparkles,
		title: "Configure your AI provider",
		description:
			"Add your OpenAI, Anthropic, or OpenRouter key, pick a model, and verify the connection.",
	},
	{
		icon: Bot,
		title: "Connect Telegram",
		description:
			"Finish with the Telegram wizard so your Hermes agent is reachable from chat right away.",
	},
	{
		icon: MessageCircle,
		title: "Start chatting",
		description:
			"Open Telegram or the Hermes Web UI and start using your personal agent on your own server.",
	},
] as const;

const productFeatures = [
	{
		icon: ShieldCheck,
		title: "Passwordless login",
		description:
			"Sign in with a magic link — no passwords to remember or manage.",
	},
	{
		icon: Wrench,
		title: "Guided VPS setup",
		description:
			"A step-by-step wizard walks you through server connection without SSH expertise.",
	},
	{
		icon: Download,
		title: "One-click Hermes deployment",
		description:
			"Install Docker, Compose, config, and startup from the dashboard with live progress.",
	},
	{
		icon: Sparkles,
		title: "AI provider configuration",
		description:
			"Configure OpenAI, Anthropic, OpenRouter, and more without editing env files.",
	},
	{
		icon: Bot,
		title: "Telegram onboarding",
		description:
			"Connect your bot, verify the token, and approve pairing codes from one screen.",
	},
	{
		icon: Activity,
		title: "Live server monitoring",
		description:
			"Watch install logs, CPU, memory, and disk from a dashboard built for day-two ops.",
	},
	{
		icon: RefreshCw,
		title: "One-click restart, update, and rollback",
		description:
			"Manage the running agent with audit history instead of remote shell commands.",
	},
	{
		icon: Globe,
		title: "Built-in Hermes Web UI",
		description:
			"Deploy and open the Hermes browser interface from your server detail page.",
	},
] as const;

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		const session = await getCurrentSession();

		if (session) {
			throw redirect({ to: "/dashboard" });
		}
	},
	head: () => ({
		meta: [
			{
				title: "HermesHub — Deploy Hermes Agent without the terminal",
			},
			{
				name: "description",
				content:
					"Deploy and manage a self-hosted Hermes AI Agent on any VPS without SSH, Docker, or Linux knowledge. Your personal AI agent in 5 minutes.",
			},
		],
	}),
	component: App,
});

function App() {
	return (
		<main className="page-wrap px-4 pb-12 pt-14">
			<section className="island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
				<div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.32),transparent_66%)]" />
				<div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(47,106,74,0.18),transparent_66%)]" />

				<div className="relative max-w-4xl">
					<div className="mb-5 flex items-center gap-3">
						<BrandMark size="lg" />
						<p className="display-title m-0 text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
							HermesHub
						</p>
					</div>

					<h1 className="display-title mb-5 max-w-4xl text-4xl leading-[1.02] font-bold tracking-tight text-[var(--sea-ink)] sm:text-6xl">
						Your personal AI agent in 5 minutes. Zero terminal required.
					</h1>
					<p className="max-w-2xl text-base text-[var(--sea-ink-soft)] sm:text-lg">
						Deploy and manage a self-hosted Hermes AI Agent on any VPS without
						SSH, Docker, or Linux knowledge.
					</p>

					<div className="mt-8 flex flex-wrap gap-3">
						<Button asChild>
							<Link to="/login">
								Deploy Hermes Agent
								<ArrowRight />
							</Link>
						</Button>
						<Button asChild variant="secondary">
							<a href={githubRepoUrl} target="_blank" rel="noopener noreferrer">
								View GitHub
								<ExternalLink />
							</a>
						</Button>
					</div>
				</div>
			</section>

			<section className="island-shell mt-8 rounded-[2rem] px-6 py-8 sm:px-8">
				<p className="island-kicker mb-2">The problem</p>
				<h2 className="display-title text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
					Self-hosting Hermes is powerful. Getting it running is not.
				</h2>
				<ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{setupPainPoints.map(({ icon: Icon, label }) => (
						<li
							key={label}
							className="flex items-center gap-3 rounded-2xl border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-3 text-sm font-medium text-[var(--sea-ink-soft)]"
						>
							<Icon className="h-4 w-4 flex-none text-[var(--lagoon-deep)]" />
							<span>{label}</span>
						</li>
					))}
				</ul>
				<p className="mt-6 max-w-2xl text-base font-semibold text-[var(--sea-ink)]">
					HermesHub handles it all for you.
				</p>
			</section>

			<section id="how-it-works" className="mt-8 space-y-4">
				<div className="island-shell rounded-[2rem] px-6 py-6 sm:px-8">
					<p className="island-kicker mb-2">How it works</p>
					<h2 className="display-title text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
						From VPS access to first chat in five guided steps.
					</h2>
				</div>

				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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

			<section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{productFeatures.map(({ description, icon: Icon, title }, index) => (
					<article
						key={title}
						className="island-shell feature-card rise-in rounded-[2rem] p-5"
						style={{ animationDelay: `${index * 70 + 100}ms` }}
					>
						<div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--lagoon-deep)]">
							<Icon className="h-5 w-5" />
						</div>
						<h2 className="mb-2 text-base font-semibold text-[var(--sea-ink)]">
							{title}
						</h2>
						<p className="m-0 text-sm leading-6 text-[var(--sea-ink-soft)]">
							{description}
						</p>
					</article>
				))}
			</section>

			<section className="island-shell mt-8 rounded-[2rem] px-6 py-8 sm:px-8">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<p className="island-kicker mb-2">Ready to launch</p>
						<h2 className="display-title text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
							Deploy Hermes without living in the terminal.
						</h2>
						<p className="mt-3 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
							Sign in with a magic link, connect your VPS, and let HermesHub
							guide the rest.
						</p>
					</div>

					<div className="flex flex-wrap gap-3">
						<Button asChild>
							<Link to="/login">
								Deploy Hermes Agent
								<ArrowRight />
							</Link>
						</Button>
						<Button asChild variant="secondary">
							<a href={githubRepoUrl} target="_blank" rel="noopener noreferrer">
								View GitHub
								<ExternalLink />
							</a>
						</Button>
					</div>
				</div>
			</section>
		</main>
	);
}
