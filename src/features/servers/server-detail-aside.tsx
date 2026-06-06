import type {
	ServerActionHistoryItem,
	ServerDetailSnapshot,
} from "@/lib/server-detail";

import { HermesWebUiCard } from "./hermes-web-ui-card";
import {
	badgeClassName,
	formatActionHistorySummary,
	formatActionTitle,
	formatInstallStatus,
	formatOsSummary,
	formatTimestamp,
} from "./server-detail-helpers";

type ServerDetailAsideProps = {
	detail: ServerDetailSnapshot;
	onDetailChange?: (detail: ServerDetailSnapshot) => void;
};

export function ServerDetailAside({
	detail,
	onDetailChange,
}: ServerDetailAsideProps) {
	return (
		<aside className="space-y-4">
			<HermesWebUiCard detail={detail} onDetailChange={onDetailChange} />

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
							<ActionHistoryItem key={item.id} item={item} />
						))}
					</ul>
				)}
			</section>
		</aside>
	);
}

type SummaryEntryProps = {
	label: string;
	value: string;
};

function SummaryEntry({ label, value }: SummaryEntryProps) {
	return (
		<div>
			<dt className="text-[var(--sea-ink-soft)]">{label}</dt>
			<dd className="mt-1 font-medium">{value}</dd>
		</div>
	);
}

function ActionHistoryItem({ item }: { item: ServerActionHistoryItem }) {
	return (
		<li className="list-none rounded-[1.25rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
						{formatActionTitle(item.action)}
					</p>
					<p className="mt-1 mb-0 line-clamp-2 text-sm text-[var(--sea-ink-soft)]">
						{formatActionHistorySummary(item)}
					</p>
					<p className="mt-1 mb-0 text-xs text-[var(--sea-ink-soft)]">
						{formatTimestamp(item.createdAt)}
					</p>
				</div>
				<span className={badgeClassName(item.result)}>{item.result}</span>
			</div>
		</li>
	);
}
