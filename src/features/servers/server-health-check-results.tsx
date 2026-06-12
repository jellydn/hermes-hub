import { Activity, LoaderCircle } from "lucide-react";
import { AlertPanel } from "#/components/ui/alert-panel";
import { Button } from "#/components/ui/button";
import { StatusIcon } from "#/components/ui/status-icon";
import { getStatusPillClassName, getStatusPillType } from "#/lib/status-pill";
import type { ServerHealthCheckResult } from "#shared/contracts/server-health-check";

type ServerHealthCheckPanelProps = {
	error: string | null;
	pending: boolean;
	result: ServerHealthCheckResult | null;
	onRunHealthCheck: () => void;
};

export function ServerHealthCheckPanel({
	error,
	pending,
	result,
	onRunHealthCheck,
}: ServerHealthCheckPanelProps) {
	return (
		<>
			<div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
				<Button
					type="button"
					variant="secondary"
					onClick={onRunHealthCheck}
					disabled={pending}
				>
					{pending ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : (
						<Activity className="h-4 w-4" />
					)}
					<span>{pending ? "Checking setup..." : "Check setup"}</span>
				</Button>
			</div>

			{error ? (
				<AlertPanel tone="error" withStatusIcon className="mt-5">
					{error}
				</AlertPanel>
			) : null}

			{result ? <ServerHealthCheckResults result={result} /> : null}
		</>
	);
}

function ServerHealthCheckResults({
	result,
}: {
	result: ServerHealthCheckResult;
}) {
	return (
		<div className="mt-5 rounded-[1.5rem] border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
						Setup check results
					</p>
					<p className="mt-2 mb-0 text-sm text-[var(--sea-ink-soft)]">
						Checked {formatCheckedAt(result.checkedAt)}. These checks confirm
						the VPS is ready to run Hermes — no security expertise required.
					</p>
				</div>
				<span className={getStatusPillClassName(result.status)}>
					<StatusIcon status={getStatusPillType(result.status)} size={3.5} />
					{result.status}
				</span>
			</div>

			<div className="mt-5 space-y-5">
				{result.groups.map((group) => (
					<section key={group.label}>
						<h4 className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
							{group.label}
						</h4>
						<ul className="mt-3 space-y-3">
							{group.items.map((item) => (
								<li
									key={item.label}
									className="flex flex-col gap-2 rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
								>
									<div>
										<p className="m-0 text-sm font-medium text-[var(--sea-ink)]">
											{item.label}
										</p>
										<p className="mt-1 mb-0 text-sm text-[var(--sea-ink-soft)]">
											{item.detail}
										</p>
									</div>
									<span className={getStatusPillClassName(item.status)}>
										<StatusIcon
											status={getStatusPillType(item.status)}
											size={3.5}
										/>
										{item.status}
									</span>
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</div>
	);
}

function formatCheckedAt(checkedAt: string) {
	const date = new Date(checkedAt);
	if (Number.isNaN(date.getTime())) {
		return "just now";
	}

	return date.toLocaleString();
}
