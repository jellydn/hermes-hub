import { CheckCircle2, LoaderCircle, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
	type ServerBasicsDraft,
	type ServerBasicsErrors,
	serverBasicsFields,
} from "./server-detail-helpers";

type ServerBasicsFormProps = {
	draft: ServerBasicsDraft;
	errors: ServerBasicsErrors;
	isEditing: boolean;
	isSaving: boolean;
	onCancel: () => void;
	onChange: (field: keyof ServerBasicsDraft, value: string) => void;
	onSave: () => void;
	onStartEditing: () => void;
};

export function ServerBasicsForm({
	draft,
	errors,
	isEditing,
	isSaving,
	onCancel,
	onChange,
	onSave,
	onStartEditing,
}: ServerBasicsFormProps) {
	return (
		<>
			<div className="mt-6 grid gap-5 md:grid-cols-2">
				{serverBasicsFields.map((config) => (
					<ServerBasicsField
						key={config.field}
						field={config.field}
						label={config.label}
						value={draft[config.field]}
						hint={config.hint}
						error={errors[config.field]}
						inputMode={config.inputMode}
						isEditing={isEditing}
						onChange={onChange}
						onEdit={onStartEditing}
						type={config.type}
					/>
				))}
			</div>

			{isEditing ? (
				<div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
					<Button type="button" onClick={onSave} disabled={isSaving}>
						{isSaving ? (
							<LoaderCircle className="h-4 w-4 animate-spin" />
						) : (
							<CheckCircle2 className="h-4 w-4" />
						)}
						<span>{isSaving ? "Saving..." : "Save changes"}</span>
					</Button>
					<Button
						type="button"
						variant="secondary"
						onClick={onCancel}
						disabled={isSaving}
					>
						Cancel
					</Button>
				</div>
			) : null}
		</>
	);
}

function ServerBasicsField({
	field,
	label,
	value,
	hint,
	error,
	inputMode,
	isEditing,
	onChange,
	onEdit,
	type,
}: {
	field: keyof ServerBasicsDraft;
	label: string;
	value: string;
	hint: string;
	error?: string;
	inputMode?: "numeric";
	isEditing: boolean;
	onChange: (field: keyof ServerBasicsDraft, value: string) => void;
	onEdit: () => void;
	type: "number" | "text";
}) {
	return (
		<div className="space-y-2">
			<label
				className="block text-sm font-semibold text-[var(--sea-ink)]"
				htmlFor={field}
			>
				{label}
			</label>
			<div
				className={cn(
					"flex items-center gap-2 rounded-full border bg-white/80 pr-1 pl-4",
					error ? "border-[#b42318]" : "border-[var(--chip-line)]",
				)}
			>
				<input
					id={field}
					name={field}
					type={type}
					inputMode={inputMode}
					readOnly={!isEditing}
					value={value}
					onChange={(event) => onChange(field, event.currentTarget.value)}
					className="h-11 flex-1 bg-transparent text-sm text-[var(--sea-ink)] outline-none read-only:cursor-default"
				/>
				{isEditing ? null : (
					<button
						type="button"
						onClick={onEdit}
						className="inline-flex size-9 items-center justify-center rounded-full border border-transparent text-[var(--sea-ink-soft)] transition hover:border-[var(--chip-line)] hover:bg-white hover:text-[var(--sea-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lagoon)]"
						aria-label={`Edit ${label}`}
					>
						<Pencil className="h-4 w-4" />
					</button>
				)}
			</div>
			<p
				className={cn(
					"block min-h-5 text-xs",
					error ? "text-[#b42318]" : "text-[var(--sea-ink-soft)]",
				)}
			>
				{error ?? hint}
			</p>
		</div>
	);
}
