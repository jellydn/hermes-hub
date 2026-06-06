export const providerInputClassName =
	"w-full rounded-full border border-[var(--chip-line)] bg-white/80 px-4 py-3 text-sm text-[var(--sea-ink)] outline-none focus:border-[color:var(--lagoon)] focus:ring-2 focus:ring-[rgba(79,184,178,0.18)]";

export function ProviderSettingsField({
	children,
	hint,
	label,
	name,
}: {
	children: React.ReactNode;
	hint: string;
	label: string;
	name: string;
}) {
	return (
		<div className="space-y-2">
			<label
				className="block text-sm font-semibold text-[var(--sea-ink)]"
				htmlFor={name}
			>
				{label}
			</label>
			{children}
			<p className="block min-h-5 text-xs text-[var(--sea-ink-soft)]">{hint}</p>
		</div>
	);
}
