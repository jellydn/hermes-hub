import { Plus } from "lucide-react";

import { Button } from "#/components/ui/button";

import { mcpInputClassName, type SecretRow } from "./mcp-form-state";

type McpSecretRowsEditorProps = {
	label: string;
	rows: SecretRow[];
	onAdd: () => void;
	onRemove: (index: number) => void;
	onChange: (index: number, patch: Partial<SecretRow>) => void;
};

export function McpSecretRowsEditor({
	label,
	rows,
	onAdd,
	onRemove,
	onChange,
}: McpSecretRowsEditorProps) {
	return (
		<div className="space-y-3">
			<div>
				<p className="m-0 text-sm font-medium text-[var(--sea-ink)]">{label}</p>
				<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
					Leave values blank on edit to keep stored secrets.
				</p>
			</div>

			{rows.map((row, index) => (
				<div
					key={row.id}
					className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
				>
					<input
						value={row.key}
						onChange={(event) => onChange(index, { key: event.target.value })}
						className={mcpInputClassName}
						placeholder="KEY"
						aria-label={`${label} key ${index + 1}`}
					/>
					<div className="space-y-1">
						<input
							value={row.value}
							onChange={(event) =>
								onChange(index, { value: event.target.value })
							}
							className={mcpInputClassName}
							placeholder={
								row.hasStoredValue && row.valueLast4
									? `Stored value ending in ${row.valueLast4}`
									: "Value"
							}
							aria-label={`${label} value ${index + 1}`}
						/>
						{row.hasStoredValue && row.valueLast4 ? (
							<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
								Stored value ending in {row.valueLast4}. Paste a new one to
								replace it.
							</p>
						) : null}
					</div>
					<Button
						type="button"
						variant="secondary"
						onClick={() => onRemove(index)}
					>
						Remove
					</Button>
				</div>
			))}

			<Button type="button" variant="secondary" onClick={onAdd}>
				<Plus className="h-4 w-4" />
				<span>Add row</span>
			</Button>
		</div>
	);
}
