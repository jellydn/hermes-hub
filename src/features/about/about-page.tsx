import { Link } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { hermesCommunitySiteUrl } from "@/lib/hermes-community";

export function AboutPage() {
	return (
		<main className="page-wrap px-4 py-12">
			<section className="island-shell rounded-[2rem] p-6 sm:p-8">
				<p className="island-kicker mb-2">About HermesHub</p>
				<h1 className="display-title mb-4 text-4xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-5xl">
					The easiest way to self-host Hermes Agent.
				</h1>
				<p className="max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
					Hermes Agent is an open-source personal agent that lives on your
					server and grows with you. HermesHub is a separate product focused on
					the setup path: magic-link sign in, VPS verification, one-click
					installation, AI provider setup, Telegram onboarding, and simple
					ongoing controls for restart, update, and rollback.
				</p>
				<p className="mt-4 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
					For the broader Hermes ecosystem — including the browser-based Hermes
					Web UI — visit the community site at{" "}
					<a
						href={hermesCommunitySiteUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="font-semibold text-[var(--sea-ink)] underline decoration-[var(--chip-line)] underline-offset-4"
					>
						get-hermes.ai
					</a>
					. HermesHub is not affiliated with that site and does not replace it.
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
							href={hermesCommunitySiteUrl}
							target="_blank"
							rel="noopener noreferrer"
						>
							Visit the Hermes community site
							<ExternalLink />
						</a>
					</Button>
				</div>
			</section>
		</main>
	);
}
