export default function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer className="mt-20 border-t border-[var(--line)] px-4 pb-14 pt-10 text-[var(--sea-ink-soft)]">
			<div className="page-wrap flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
				<p className="m-0 text-sm">
					&copy; {year} HermesHub. Self-hosted AI, without the terminal.
				</p>
				<p className="island-kicker m-0">Built for zero-terminal VPS setup</p>
			</div>
		</footer>
	);
}
