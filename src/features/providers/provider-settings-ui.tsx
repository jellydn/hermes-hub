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
