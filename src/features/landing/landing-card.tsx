import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const iconWrapClassName =
	"flex h-11 w-11 items-center justify-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--lagoon-deep)]";

type LandingChipProps = {
	icon: LucideIcon;
	label: string;
};

export function LandingChip({ icon: Icon, label }: LandingChipProps) {
	return (
		<li className="flex items-center gap-3 rounded-2xl border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-3 text-sm font-medium text-[var(--sea-ink-soft)]">
			<Icon className="h-4 w-4 flex-none text-[var(--lagoon-deep)]" />
			<span>{label}</span>
		</li>
	);
}

type LandingCardProps = {
	icon: LucideIcon;
	title: string;
	description: string;
	kicker?: string;
	headingLevel?: "h2" | "h3";
	titleClassName?: string;
	animationDelay?: number;
};

export function LandingCard({
	animationDelay,
	description,
	headingLevel = "h2",
	icon: Icon,
	kicker,
	title,
	titleClassName,
}: LandingCardProps) {
	const HeadingTag = headingLevel;

	return (
		<article
			className="island-shell feature-card rise-in rounded-[2rem] p-5"
			style={
				animationDelay === undefined
					? undefined
					: { animationDelay: `${animationDelay}ms` }
			}
		>
			<div className={cn("mb-4", iconWrapClassName)}>
				<Icon className="h-5 w-5" />
			</div>
			{kicker ? <p className="island-kicker mb-2">{kicker}</p> : null}
			<HeadingTag
				className={cn(
					"mb-2 font-semibold text-[var(--sea-ink)]",
					headingLevel === "h3" ? "text-lg" : "text-base",
					titleClassName,
				)}
			>
				{title}
			</HeadingTag>
			<p className="m-0 text-sm leading-6 text-[var(--sea-ink-soft)]">
				{description}
			</p>
		</article>
	);
}
