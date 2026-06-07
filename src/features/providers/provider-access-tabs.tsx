import { cn } from "#/lib/utils";
import type { ModelAccessSnapshot } from "#shared/contracts/model-access";
import type { ProviderAccessTab } from "./provider-access-tab";

type ProviderAccessTabsProps = {
	selectedTab: ProviderAccessTab;
	activeBackend: ModelAccessSnapshot["activeBackend"];
	onTabChange: (tab: ProviderAccessTab) => void;
};

const tabs: Array<{
	id: ProviderAccessTab;
	label: string;
	backend: NonNullable<ModelAccessSnapshot["activeBackend"]>;
}> = [
	{
		id: "subscription",
		label: "User subscriptions",
		backend: "subscription",
	},
	{
		id: "api",
		label: "API providers",
		backend: "api-provider",
	},
];

export function ProviderAccessTabs({
	selectedTab,
	activeBackend,
	onTabChange,
}: ProviderAccessTabsProps) {
	return (
		<div
			role="tablist"
			aria-label="Model access type"
			className="grid gap-2 rounded-[1.75rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] p-2 sm:grid-cols-2"
		>
			{tabs.map((tab) => {
				const isSelected = selectedTab === tab.id;
				const isActiveBackend = activeBackend === tab.backend;

				return (
					<button
						key={tab.id}
						type="button"
						role="tab"
						id={`provider-access-tab-${tab.id}`}
						aria-selected={isSelected}
						aria-controls={`provider-access-panel-${tab.id}`}
						onClick={() => onTabChange(tab.id)}
						className={cn(
							"flex min-h-14 items-center justify-between gap-3 rounded-[1.35rem] border px-4 py-3 text-left transition",
							isSelected
								? "border-[color:var(--lagoon)] bg-[rgba(79,184,178,0.14)] text-[var(--sea-ink)]"
								: "border-transparent bg-transparent text-[var(--sea-ink-soft)] hover:border-[var(--chip-line)] hover:bg-white/50 hover:text-[var(--sea-ink)]",
						)}
					>
						<span className="text-sm font-semibold sm:text-base">
							{tab.label}
						</span>
						{isActiveBackend ? (
							<span className="shrink-0 rounded-full bg-[rgba(79,184,178,0.2)] px-3 py-1 text-xs font-semibold text-[var(--lagoon-deep)]">
								Active
							</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}
