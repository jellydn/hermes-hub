import type { ServerDetailSnapshot } from "@/lib/server-detail";

import {
	badgeClassName,
	formatActionTitle,
	formatInstallStatus,
	formatOsSummary,
	formatTimestamp,
} from "./server-detail-helpers";

type ServerDetailAsideProps = {
	detail: ServerDetailSnapshot;
};

export function ServerDetailAside({ detail }: ServerDetailAsideProps) {
	return (
		<aside className="space-y-4">
			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Connection summary</p>
				<dl className="space-y-4 text-sm text-[var(--sea-ink)]">
					<SummaryEntry label="Host" value={detail.server.host} />
					<SummaryEntry label="User" value={detail.server.username} />
					<SummaryEntry
						label="Status"
						value={formatInstallStatus(detail.server.status)}
					/>
					<SummaryEntry label="OS" value={formatOsSummary(detail)} />
				</dl>
			</section>

			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Action history</p>
				{detail.actionHistory.length === 0 ? (
					<p className="m-0 text-sm text-[var(--sea-ink-soft)]">
						No actions yet.
					</p>
				) : (
					<ul className="m-0 space-y-3 p-0">
						{detail.actionHistory.map((item) => (
							<li
								key={item.id}
								className="list-none rounded-[1.25rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4"
							>
								<div className="flex items-center justify-between gap-3">
									<p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
										{formatActionTitle(item.action)}
									</p>
									<span className={badgeClassName(item.result)}>
										{item.result}
									</span>
								</div>
								<p className="mt-2 mb-0 text-sm text-[var(--sea-ink-soft)]">
									{item.message}
								</p>
								<p className="mt-2 mb-0 text-xs text-[var(--sea-ink-soft)]">
									{formatTimestamp(item.createdAt)}
								</p>
							</li>
						))}
					</ul>
				)}
			</section>
		</aside>
	);
}

function SummaryEntry({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-[var(--sea-ink-soft)]">{label}</dt>
			<dd className="mt-1 font-medium">{value}</dd>
		</div>
	);
}
