import { cva } from "class-variance-authority";

export const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--focus-ring-offset)] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"border border-[color:var(--button-default-border)] bg-[var(--button-default-bg)] text-[var(--button-default-fg)] shadow-[0_10px_30px_rgba(50,143,151,0.12)] hover:-translate-y-0.5 hover:brightness-110",
				secondary:
					"border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--sea-ink)] hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--sea-ink)_20%,transparent)]",
				ghost:
					"text-[var(--sea-ink-soft)] hover:bg-[var(--link-bg-hover)] hover:text-[var(--sea-ink)]",
				link: "px-0 text-[var(--lagoon-deep)] underline-offset-4 hover:underline",
				destructive:
					"border border-[color:var(--button-destructive-border)] bg-[var(--button-destructive-bg)] text-[var(--button-destructive-fg)] hover:brightness-110",
			},
			size: {
				default: "h-11 px-5 py-2.5",
				sm: "h-9 px-4",
				lg: "h-12 px-6 text-base",
				icon: "size-10 rounded-full",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);
