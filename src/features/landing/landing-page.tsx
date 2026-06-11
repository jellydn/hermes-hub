import { BrandMark } from "#/components/brand-mark";
import { LandingCard, LandingChip } from "./landing-card";
import {
	productFeatures,
	setupPainPoints,
	setupSteps,
} from "./landing-content";
import { LandingCtas } from "./landing-ctas";

const stepAnimationBaseMs = 80;
const stepAnimationStepMs = 90;
const featureAnimationBaseMs = 100;
const featureAnimationStepMs = 70;

export function LandingPage() {
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

					<LandingCtas className="mt-8" />
				</div>
			</section>

			<section className="island-shell mt-8 rounded-[2rem] px-6 py-8 sm:px-8">
				<p className="island-kicker mb-2">The problem</p>
				<h2 className="display-title text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
					Self-hosting Hermes is powerful. Getting it running is not.
				</h2>
				<ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{setupPainPoints.map((item) => (
						<LandingChip key={item.label} {...item} />
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
					{setupSteps.map(({ description, icon, title }, index) => (
						<LandingCard
							key={title}
							icon={icon}
							title={title}
							description={description}
							kicker={`Step ${index + 1}`}
							headingLevel="h3"
							animationDelay={index * stepAnimationStepMs + stepAnimationBaseMs}
						/>
					))}
				</div>
			</section>

			<section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{productFeatures.map(({ description, icon, title }, index) => (
					<LandingCard
						key={title}
						icon={icon}
						title={title}
						description={description}
						animationDelay={
							index * featureAnimationStepMs + featureAnimationBaseMs
						}
					/>
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

					<LandingCtas />
				</div>
			</section>
		</main>
	);
}
