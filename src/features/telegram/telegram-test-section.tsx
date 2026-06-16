import { LoaderCircle, Send, XCircle } from "lucide-react";
import { useReducer, useRef, useState } from "react";

import { AlertPanel } from "#/components/ui/alert-panel";
import { Button } from "#/components/ui/button";
import { HostKeyTrustPanel } from "#/components/ui/host-key-trust-panel";
import { inputClassName } from "#/components/ui/input-class";
import {
	type HostKeyErrorPayload,
	parseHostKeyErrorPayload,
} from "#/features/servers/host-key-recovery";

type TestState = {
	isTesting: boolean;
	isAcceptingKey: boolean;
	testError: string | null;
	testResponse: string | null;
	hostKeyError: HostKeyErrorPayload | null;
};

type TestAction =
	| { type: "testStarted" }
	| { type: "testSucceeded"; response: string }
	| { type: "testFailed"; error: string }
	| { type: "testHostKeyDetected"; hostKeyError: HostKeyErrorPayload }
	| { type: "acceptKeyStarted" }
	| { type: "acceptKeyFailed"; error: string }
	| { type: "acceptKeySucceeded" }
	| { type: "hostKeyCleared" };

function testReducer(state: TestState, action: TestAction): TestState {
	switch (action.type) {
		case "testStarted":
			return {
				...state,
				isTesting: true,
				testResponse: null,
				testError: null,
				hostKeyError: null,
			};
		case "testSucceeded":
			return { ...state, isTesting: false, testResponse: action.response };
		case "testFailed":
			return { ...state, isTesting: false, testError: action.error };
		case "testHostKeyDetected":
			return { ...state, isTesting: false, hostKeyError: action.hostKeyError };
		case "acceptKeyStarted":
			return { ...state, isAcceptingKey: true, testError: null };
		case "acceptKeyFailed":
			return { ...state, isAcceptingKey: false, testError: action.error };
		case "acceptKeySucceeded":
			return { ...state, isAcceptingKey: false, hostKeyError: null };
		case "hostKeyCleared":
			return { ...state, hostKeyError: null };
		default:
			return state;
	}
}

const initialTestState: TestState = {
	isTesting: false,
	isAcceptingKey: false,
	testError: null,
	testResponse: null,
	hostKeyError: null,
};

type TelegramTestSectionProps = {
	isDeployed: boolean;
};

export function TelegramTestSection({ isDeployed }: TelegramTestSectionProps) {
	const [testMessage, setTestMessage] = useState("");
	const [state, dispatch] = useReducer(testReducer, initialTestState);
	const stateRef = useRef(state);
	stateRef.current = state;

	async function handleTest() {
		const message = testMessage.trim();
		if (!message) {
			return;
		}

		dispatch({ type: "testStarted" });

		try {
			const response = await fetch("/api/telegram/test", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ message }),
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				response?: string;
			} | null;

			if (!response.ok) {
				const hostKeyErrorPayload = parseHostKeyErrorPayload(payload);
				if (hostKeyErrorPayload) {
					dispatch({
						type: "testHostKeyDetected",
						hostKeyError: hostKeyErrorPayload,
					});
					return;
				}
				dispatch({
					type: "testFailed",
					error: payload?.error ?? "Test failed",
				});
				return;
			}

			dispatch({
				type: "testSucceeded",
				response: payload?.response ?? "(empty response)",
			});
		} catch {
			dispatch({ type: "testFailed", error: "Test failed" });
		}
	}

	async function handleTrustAndRetryTest() {
		const { hostKeyError } = stateRef.current;
		if (!hostKeyError) return;

		dispatch({ type: "acceptKeyStarted" });

		try {
			const res = await fetch(
				`/api/servers/${encodeURIComponent(hostKeyError.serverId)}/host-key/accept`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						fingerprint: hostKeyError.observedFingerprint,
						algorithm: hostKeyError.observedAlgorithm,
					}),
				},
			);

			const data = (await res.json().catch(() => null)) as {
				error?: string;
			} | null;

			if (!res.ok || data?.error) {
				dispatch({
					type: "acceptKeyFailed",
					error: data?.error ?? "Failed to trust host key",
				});
				return;
			}

			dispatch({ type: "acceptKeySucceeded" });
			void handleTest();
		} catch {
			dispatch({
				type: "acceptKeyFailed",
				error: "Network error during host key acceptance",
			});
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
				<AlertPanel
					tone="warning"
					LeadingIcon={XCircle}
					leadingIconClassName="h-5 w-5 text-[var(--alert-warning-fg)]"
				>
					Deploy the bot token to a server first before testing.
				</AlertPanel>
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
									if (event.key === "Enter" && !state.isTesting) {
										void handleTest();
									}
								}}
								className={inputClassName}
								placeholder="What can you do?"
								disabled={state.isTesting}
							/>
							<Button
								type="button"
								onClick={() => void handleTest()}
								disabled={state.isTesting || !testMessage.trim()}
							>
								{state.isTesting ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : (
									<Send className="h-4 w-4" />
								)}
								<span>{state.isTesting ? "Sending..." : "Send"}</span>
							</Button>
						</div>
					</div>

					{state.isTesting ? (
						<div className="mt-4 rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-weak)] px-4 py-3 text-sm text-[var(--sea-ink-soft)]">
							Waiting for Hermes response...
						</div>
					) : null}

					{state.testResponse ? (
						<div className="mt-4 rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-weak)] px-4 py-3 text-sm text-[var(--sea-ink)]">
							<div className="mb-1 text-xs font-semibold text-[var(--sea-ink-soft)]">
								Hermes response
							</div>
							<div className="whitespace-pre-wrap">{state.testResponse}</div>
						</div>
					) : null}

					{state.hostKeyError ? (
						<HostKeyTrustPanel
							hostKeyError={state.hostKeyError}
							isAcceptingKey={state.isAcceptingKey}
							onTrustAndRetry={() => void handleTrustAndRetryTest()}
							onDismiss={() => dispatch({ type: "hostKeyCleared" })}
						/>
					) : null}

					{state.testError ? (
						<AlertPanel tone="error" className="mt-4">
							{state.testError}
						</AlertPanel>
					) : null}
				</>
			)}
		</section>
	);
}
