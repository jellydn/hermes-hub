import { LoaderCircle, Save } from "lucide-react";
import { Button } from "#/components/ui/button";
import { FormFeedback } from "#/components/ui/form-feedback";
import { cn } from "#/lib/utils";
import {
	canDeriveScannerBypassUrl,
	getScannerBypassUnavailableReason,
	type SkillSourceType,
} from "#shared/contracts/agent-skills";

export type SkillFormState = {
	name: string;
	sourceType: SkillSourceType;
	installRef: string;
	content: string;
	enabled: boolean;
	acceptScannerRisk: boolean;
};

type SkillFormProps = {
	form: SkillFormState;
	isEditing: boolean;
	isSaving: boolean;
	onChangeField: <K extends keyof SkillFormState>(
		field: K,
		value: SkillFormState[K],
	) => void;
	onSave: () => void;
	onCancel: () => void;
};

export function SkillForm({
	form,
	isEditing,
	isSaving,
	onChangeField,
	onSave,
	onCancel,
}: SkillFormProps) {
	const bypassAvailable =
		form.sourceType === "hub" || form.sourceType === "url"
			? canDeriveScannerBypassUrl(form.installRef, form.sourceType)
			: false;
	const bypassUnavailableReason =
		form.sourceType === "hub" || form.sourceType === "url"
			? getScannerBypassUnavailableReason(form.installRef, form.sourceType)
			: null;

	return (
		<section
			className="island-shell rounded-[2rem] p-6 sm:p-8"
			id="skill-form-section"
		>
			<div className="mb-6">
				<p className="island-kicker m-0">
					{isEditing ? "Edit Skill" : "Add Skill"}
				</p>
				<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
					{isEditing ? `Modify ${form.name}` : "Configure New Skill"}
				</h3>
			</div>

			<div className="space-y-4">
				<div className="grid gap-2">
					<label
						htmlFor="skill-name"
						className="text-sm font-medium text-[var(--sea-ink)]"
					>
						Skill name
					</label>
					<input
						id="skill-name"
						type="text"
						value={form.name}
						onChange={(e) => onChangeField("name", e.target.value)}
						className="w-full rounded-[1rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--sea-ink-soft)]"
						placeholder="e.g. web-search"
					/>
					<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
						Must start with a letter and contain only letters, numbers,
						underscores, or hyphens.
					</p>
				</div>

				<div className="grid gap-2">
					<span className="text-sm font-medium text-[var(--sea-ink)]">
						Source type
					</span>
					<div className="flex flex-wrap gap-3">
						{(["hub", "url", "custom"] as const).map((type) => (
							<label
								key={type}
								className={cn(
									"flex items-center gap-2 rounded-[1rem] border px-4 py-2 text-sm font-medium cursor-pointer transition",
									form.sourceType === type
										? "border-[var(--sea-ink-soft)] bg-[var(--sea-ink)]/5 text-[var(--sea-ink)]"
										: "border-[var(--line)] hover:border-[var(--sea-ink-soft)] text-[var(--sea-ink-soft)]",
								)}
							>
								<input
									type="radio"
									name="sourceType"
									value={type}
									checked={form.sourceType === type}
									onChange={() => onChangeField("sourceType", type)}
									className="sr-only"
									disabled={isEditing}
								/>
								<span className="capitalize">
									{type === "hub"
										? "Hub ID"
										: type === "url"
											? "URL"
											: "Custom SKILL.md"}
								</span>
							</label>
						))}
					</div>
					{isEditing && (
						<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
							Source type cannot be changed after creation.
						</p>
					)}
				</div>

				{(form.sourceType === "hub" || form.sourceType === "url") && (
					<div className="grid gap-2">
						<label
							htmlFor="skill-ref"
							className="text-sm font-medium text-[var(--sea-ink)]"
						>
							{form.sourceType === "hub" ? "Hub ID / Ref" : "SKILL.md URL"}
						</label>
						<input
							id="skill-ref"
							type="text"
							value={form.installRef}
							onChange={(e) => onChangeField("installRef", e.target.value)}
							className="w-full rounded-[1rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--sea-ink-soft)]"
							placeholder={
								form.sourceType === "hub"
									? "e.g. browse-sh/weather.gov/get-forecast-1uezib"
									: "e.g. https://github.com/user/repo/tree/main/skills/my-skill"
							}
						/>
						<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
							{form.sourceType === "hub"
								? "A single-line installer reference string."
								: "A GitHub folder URL (installs the whole skill folder, including scripts) or a direct URL to a single SKILL.md file."}
						</p>
					</div>
				)}

				{form.sourceType === "custom" && (
					<div className="grid gap-2">
						<label
							htmlFor="skill-content"
							className="text-sm font-medium text-[var(--sea-ink)]"
						>
							SKILL.md markdown content
						</label>
						<textarea
							id="skill-content"
							value={form.content}
							onChange={(e) => onChangeField("content", e.target.value)}
							rows={10}
							className="w-full rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--sea-ink-soft)] resize-y"
							placeholder="# Custom Skill&#10;&#10;Instructions for the agent..."
						/>
						<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
							Up to 50,000 characters. Markdown is fully supported.
						</p>
					</div>
				)}

				<label className="flex items-center gap-2 text-sm font-medium text-[var(--sea-ink)] cursor-pointer">
					<input
						type="checkbox"
						checked={form.enabled}
						onChange={(e) => onChangeField("enabled", e.target.checked)}
						className="h-4 w-4 rounded border-[var(--line)] text-[var(--sea-ink)] focus:ring-0"
					/>
					<span>Enabled</span>
				</label>

				{(form.sourceType === "hub" || form.sourceType === "url") && (
					<div className="space-y-2 rounded-[1rem] border border-[var(--alert-warning-border)] bg-[var(--alert-warning-bg)] p-4">
						<label
							className={cn(
								"flex items-start gap-2 text-sm font-medium text-[var(--sea-ink)]",
								bypassAvailable
									? "cursor-pointer"
									: "cursor-not-allowed opacity-60",
							)}
						>
							<input
								type="checkbox"
								checked={form.acceptScannerRisk}
								disabled={!bypassAvailable && !form.acceptScannerRisk}
								onChange={(e) =>
									onChangeField("acceptScannerRisk", e.target.checked)
								}
								className="mt-0.5 h-4 w-4 rounded border-[var(--line)] text-[var(--sea-ink)] focus:ring-0"
							/>
							<span>Accept scanner risk and bypass Hermes install guard</span>
						</label>
						{bypassAvailable ? (
							<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
								Hermes blocks skills rated dangerous even with{" "}
								<code className="text-[11px]">--force</code>. When enabled, Hub
								writes SKILL.md directly to the server instead of using{" "}
								<code className="text-[11px]">hermes skills install</code>. This
								skips the scanner but only installs a single SKILL.md file —
								scripts and reference folders are not copied. Use only when you
								trust the source.
							</p>
						) : (
							<FormFeedback className="m-0 text-xs" tone="warning">
								{bypassUnavailableReason}
							</FormFeedback>
						)}
					</div>
				)}
			</div>

			<div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
				<Button type="button" onClick={onSave} disabled={isSaving}>
					{isSaving ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : (
						<Save className="h-4 w-4" />
					)}
					<span>{isSaving ? "Saving..." : "Save Skill"}</span>
				</Button>
				<Button type="button" variant="secondary" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</section>
	);
}
