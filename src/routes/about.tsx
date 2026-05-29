import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/about")({
	head: () => ({
		meta: [
			{
				title: "About HermesHub",
			},
		],
	}),
	component: About,
});

function About() {
	return (
		<main className="page-wrap px-4 py-12">
			<section className="island-shell rounded-[2rem] p-6 sm:p-8">
				<p className="island-kicker mb-2">About HermesHub</p>
				<h1 className="display-title mb-4 text-4xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-5xl">
					The easiest way to self-host Hermes Agent.
				</h1>
				<p className="max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
					Hermes Agent from Nous Research is an open-source personal agent that
					lives on your server and grows with you. HermesHub adds the guided MVP
					layer around it: magic-link sign in, VPS verification, one-click
					installation, AI provider setup, Telegram onboarding, and simple
					ongoing controls for restart, update, and rollback.
				</p>

				<div className="mt-8 flex flex-wrap gap-3">
					<Button asChild>
						<Link to="/login">
							Start with a magic link
							<ArrowRight />
						</Link>
					</Button>
					<Button asChild variant="secondary">
						<a
							href="https://hermes-agent.nousresearch.com/"
							target="_blank"
							rel="noopener noreferrer"
						>
							Visit Hermes Agent
							<ExternalLink />
						</a>
					</Button>
				</div>
			</section>
		</main>
	);
}
