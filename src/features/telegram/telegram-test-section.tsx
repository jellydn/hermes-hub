import { LoaderCircle, Send, XCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button";

import { inputClassName } from "./telegram-input-class";

type TelegramTestSectionProps = {
	isDeployed: boolean;
};

export function TelegramTestSection({ isDeployed }: TelegramTestSectionProps) {
	const [testMessage, setTestMessage] = useState("");
	const [isTesting, setIsTesting] = useState(false);
	const [testResponse, setTestResponse] = useState<string | null>(null);
	const [testError, setTestError] = useState<string | null>(null);

	async function handleTest() {
		if (!testMessage.trim()) {
			return;
		}

		setIsTesting(true);
		setTestResponse(null);
		setTestError(null);

		try {
			const response = await fetch("/api/telegram/test", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ message: testMessage }),
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				response?: string;
			} | null;

			if (!response.ok) {
				setTestError(payload?.error ?? "Test failed");
				return;
			}

			setTestResponse(payload?.response ?? "(empty response)");
		} finally {
			setIsTesting(false);
		}
	}

	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-6 flex flex-col gap-3">
				<p className="island-kicker m-0">Test your bot</p>
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					Try a test conversation
				</h3>
				<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					Send a message to Hermes through the API server on your VPS and see
					the response.
				</p>
			</div>

			{!isDeployed ? (
				<div className="rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
					<div className="flex items-center gap-3">
						<XCircle className="h-5 w-5 text-amber-600" />
						<span>Deploy the bot token to a server first before testing.</span>
					</div>
				</div>
			) : (
				<>
					<div className="space-y-2">
						<label
							className="block text-sm font-semibold text-[var(--sea-ink)]"
							htmlFor="testMessage"
						>
							Message
						</label>
						<div className="flex gap-2">
							<input
								id="testMessage"
								type="text"
								value={testMessage}
								onChange={(event) => setTestMessage(event.currentTarget.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !isTesting) {
										void handleTest();
									}
								}}
								className={inputClassName}
								placeholder="What can you do?"
								disabled={isTesting}
							/>
							<Button
								type="button"
								onClick={() => void handleTest()}
								disabled={isTesting || !testMessage.trim()}
							>
								{isTesting ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : (
									<Send className="h-4 w-4" />
								)}
								<span>{isTesting ? "Sending..." : "Send"}</span>
							</Button>
						</div>
					</div>

					{isTesting ? (
						<div className="mt-4 rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-weak)] px-4 py-3 text-sm text-[var(--sea-ink-soft)]">
							Waiting for Hermes response...
						</div>
					) : null}

					{testResponse ? (
						<div className="mt-4 rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-weak)] px-4 py-3 text-sm text-[var(--sea-ink)]">
							<div className="mb-1 text-xs font-semibold text-[var(--sea-ink-soft)]">
								Hermes response
							</div>
							<div className="whitespace-pre-wrap">{testResponse}</div>
						</div>
					) : null}

					{testError ? (
						<div className="mt-4 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
							{testError}
						</div>
					) : null}
				</>
			)}
		</section>
	);
}
