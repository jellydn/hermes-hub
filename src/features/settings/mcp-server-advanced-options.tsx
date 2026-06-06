import { cn } from "@/lib/utils";

import { type McpFormState, mcpInputClassName } from "./mcp-form-state";

type McpServerAdvancedOptionsProps = {
	form: McpFormState;
	onPatch: (patch: Partial<McpFormState>) => void;
};

export function McpServerAdvancedOptions({
	form,
	onPatch,
}: McpServerAdvancedOptionsProps) {
	return (
		<details className="rounded-[1.25rem] border border-[var(--line)] p-4">
			<summary className="cursor-pointer text-sm font-medium text-[var(--sea-ink)]">
				Advanced options
			</summary>
			<div className="mt-4 space-y-4">
				<div className="space-y-2">
					<label
						htmlFor="mcp-tools-include"
						className="text-sm font-medium text-[var(--sea-ink)]"
					>
						Include tools
					</label>
					<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
						One tool name per line.
					</p>
					<textarea
						id="mcp-tools-include"
						value={form.toolsIncludeText}
						onChange={(event) =>
							onPatch({ toolsIncludeText: event.target.value })
						}
						rows={3}
						className={cn(mcpInputClassName, "resize-y")}
					/>
				</div>

				<div className="space-y-2">
					<label
						htmlFor="mcp-tools-exclude"
						className="text-sm font-medium text-[var(--sea-ink)]"
					>
						Exclude tools
					</label>
					<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
						One tool name per line.
					</p>
					<textarea
						id="mcp-tools-exclude"
						value={form.toolsExcludeText}
						onChange={(event) =>
							onPatch({ toolsExcludeText: event.target.value })
						}
						rows={3}
						className={cn(mcpInputClassName, "resize-y")}
					/>
				</div>

				<div className="flex flex-wrap gap-4">
					<label className="flex items-center gap-2 text-sm text-[var(--sea-ink)]">
						<input
							type="checkbox"
							checked={form.toolsResources}
							onChange={(event) =>
								onPatch({ toolsResources: event.target.checked })
							}
						/>
						Enable resources
					</label>
					<label className="flex items-center gap-2 text-sm text-[var(--sea-ink)]">
						<input
							type="checkbox"
							checked={form.toolsPrompts}
							onChange={(event) =>
								onPatch({ toolsPrompts: event.target.checked })
							}
						/>
						Enable prompts
					</label>
					<label className="flex items-center gap-2 text-sm text-[var(--sea-ink)]">
						<input
							type="checkbox"
							checked={form.supportsParallelToolCalls}
							onChange={(event) =>
								onPatch({ supportsParallelToolCalls: event.target.checked })
							}
						/>
						Supports parallel tool calls
					</label>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<label
							htmlFor="mcp-timeout"
							className="text-sm font-medium text-[var(--sea-ink)]"
						>
							Timeout (seconds)
						</label>
						<input
							id="mcp-timeout"
							value={form.timeout}
							onChange={(event) => onPatch({ timeout: event.target.value })}
							className={mcpInputClassName}
							inputMode="numeric"
						/>
					</div>
					<div className="space-y-2">
						<label
							htmlFor="mcp-connect-timeout"
							className="text-sm font-medium text-[var(--sea-ink)]"
						>
							Connect timeout (seconds)
						</label>
						<input
							id="mcp-connect-timeout"
							value={form.connectTimeout}
							onChange={(event) =>
								onPatch({ connectTimeout: event.target.value })
							}
							className={mcpInputClassName}
							inputMode="numeric"
						/>
					</div>
				</div>
			</div>
		</details>
	);
}
