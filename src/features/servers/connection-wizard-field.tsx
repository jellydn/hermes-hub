import { cn } from "#/lib/utils";

import type { WizardFieldProps } from "./connection-wizard-types";

export function WizardField({
	children,
	error,
	hint,
	label,
	name,
}: WizardFieldProps) {
	const messageId = `${name}-${error ? "error" : "hint"}`;

	return (
		<div className="space-y-2">
			<label
				className="block text-sm font-semibold text-[var(--sea-ink)]"
				htmlFor={name}
			>
				{label}
			</label>
			{children}
			<p
				id={messageId}
				className={cn(
					"block min-h-5 text-xs",
					error ? "text-[#b42318]" : "text-[var(--sea-ink-soft)]",
				)}
			>
				{error ?? hint}
			</p>
		</div>
	);
}
