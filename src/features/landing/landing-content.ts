import type { LucideIcon } from "lucide-react";
import {
	Activity,
	Bot,
	Download,
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

export type LandingChipItem = {
	icon: LucideIcon;
	label: string;
};

export type LandingCardItem = {
	icon: LucideIcon;
	title: string;
	description: string;
};

export const setupPainPoints = [
	{ icon: KeyRound, label: "SSH keys" },
	{ icon: Terminal, label: "Docker" },
	{ icon: Settings, label: "Environment variables" },
	{ icon: Sparkles, label: "Provider configuration" },
	{ icon: Bot, label: "Telegram setup" },
] as const satisfies readonly LandingChipItem[];

export const setupSteps = [
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
] as const satisfies readonly LandingCardItem[];

export const productFeatures = [
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
] as const satisfies readonly LandingCardItem[];
