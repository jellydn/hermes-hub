import {
	CheckCircle2,
	KeyRound,
	LoaderCircle,
	ShieldCheck,
} from "lucide-react";
import { AlertPanel } from "#/components/ui/alert-panel";
import { Button } from "#/components/ui/button";

type AccessSelectionFeedbackProps = {
	connectedLabel?: string;
	isConnected: boolean;
	saveError: string | null;
	saveMessage: string | null;
	testError: string | null;
};

export function AccessSelectionFeedback({
	connectedLabel = "Provider connected",
	isConnected,
	saveError,
	saveMessage,
	testError,
}: AccessSelectionFeedbackProps) {
	return (
		<>
			{saveMessage ? (
				<AlertPanel tone="success" className="mt-6">
					{saveMessage}
				</AlertPanel>
			) : null}
			{saveError ? (
				<AlertPanel tone="error" className="mt-6">
					{saveError}
				</AlertPanel>
			) : null}
			{testError ? (
				<AlertPanel tone="error" className="mt-6">
					{testError}
				</AlertPanel>
			) : null}
			{isConnected ? (
				<AlertPanel
					tone="success"
					className="mt-6"
					LeadingIcon={CheckCircle2}
					leadingIconClassName="h-5 w-5 text-[var(--alert-success-fg)]"
				>
					{connectedLabel}
				</AlertPanel>
			) : null}
		</>
	);
}

type AccessSelectionActionsProps = {
	status: "idle" | "saving" | "testing";
	onSave: () => void;
	onTest: () => void;
	saveLabel: string;
	savingLabel: string;
	showTest?: boolean;
};

export function AccessSelectionActions({
	status,
	onSave,
	onTest,
	saveLabel,
	savingLabel,
	showTest = true,
}: AccessSelectionActionsProps) {
	return (
		<div className="mt-8 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
			<Button type="button" onClick={onSave} disabled={status === "saving"}>
				{status === "saving" ? (
					<LoaderCircle className="h-4 w-4 animate-spin" />
				) : (
					<KeyRound className="h-4 w-4" />
				)}
				<span>{status === "saving" ? savingLabel : saveLabel}</span>
			</Button>
			{showTest ? (
				<Button
					type="button"
					variant="secondary"
					onClick={onTest}
					disabled={status === "testing"}
				>
					{status === "testing" ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : (
						<ShieldCheck className="h-4 w-4" />
					)}
					<span>{status === "testing" ? "Testing..." : "Test Connection"}</span>
				</Button>
			) : null}
		</div>
	);
}
