export function ReviewCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4">
			<p className="island-kicker mb-2">{label}</p>
			<p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">{value}</p>
		</div>
	);
}
