import { cn } from "#/lib/utils";

import type { AuthCardProps } from "./connection-wizard-types";

export function AuthCard({
	description,
	icon: Icon,
	onSelect,
	selected,
	title,
}: AuthCardProps) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"rounded-[1.75rem] border p-5 text-left",
				selected
					? "border-[color:var(--lagoon)] bg-[rgba(79,184,178,0.14)]"
					: "border-[var(--chip-line)] bg-[var(--chip-bg)]",
			)}
		>
			<div className="mb-4 inline-flex rounded-2xl border border-[var(--chip-line)] bg-white/70 p-3 text-[var(--lagoon-deep)]">
				<Icon className="h-5 w-5" />
			</div>
			<div className="space-y-2">
				<div className="flex items-center justify-between gap-3">
					<h4 className="m-0 text-base font-semibold text-[var(--sea-ink)]">
						{title}
					</h4>
					<span
						className={cn(
							"rounded-full px-3 py-1 text-xs font-semibold",
							selected
								? "bg-[rgba(79,184,178,0.2)] text-[var(--lagoon-deep)]"
								: "bg-white/70 text-[var(--sea-ink-soft)]",
						)}
					>
						{selected ? "Selected" : "Choose"}
					</span>
				</div>
				<p className="m-0 text-sm text-[var(--sea-ink-soft)]">{description}</p>
			</div>
		</button>
	);
}
