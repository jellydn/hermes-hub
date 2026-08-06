// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import type { ComponentPropsWithoutRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so we can wire it into the @tanstack/react-router mock below
// and assert against it from individual tests.
const routerSpies = vi.hoisted(() => ({
	invalidate: vi.fn(),
}));

// Partial mock (plan 009): stub only `useRouter`, keep every other real export
// (`Link`, `Outlet`, …) so a future consumer of another router export fails
// with a useful diagnostic instead of a silent `undefined` TypeError.
vi.mock("@tanstack/react-router", async () => {
	const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
		"@tanstack/react-router",
	);
	return {
		...actual,
		useRouter: () => ({ invalidate: routerSpies.invalidate }),
	};
});

vi.mock("lucide-react", () => {
	const MockIcon = (props: Record<string, unknown>) => <svg {...props} />;
	return {
		AlertCircle: MockIcon,
		ArrowRight: MockIcon,
		CheckCircle2: MockIcon,
		CloudUpload: MockIcon,
		Cpu: MockIcon,
		Circle: MockIcon,
		ExternalLink: MockIcon,
		Info: MockIcon,
		LoaderCircle: MockIcon,
		TriangleAlert: MockIcon,
		PlugZap: MockIcon,
		RefreshCw: MockIcon,
		Rocket: MockIcon,
		Send: MockIcon,
		Server: MockIcon,
		Sparkles: MockIcon,
		Unplug: MockIcon,
		UserCheck: MockIcon,
		Users: MockIcon,
		XCircle: MockIcon,
	};
});

vi.mock("#/components/ui/button", () => ({
	Button: ({
		asChild: _asChild,
		children,
		disabled,
		onClick,
		type = "button",
		...props
	}: ComponentPropsWithoutRef<"button"> & { asChild?: boolean }) => (
		<button type={type} disabled={disabled} onClick={onClick} {...props}>
			{children}
		</button>
	),
}));

import { Link, Outlet } from "@tanstack/react-router";

import { TelegramSettings } from "./telegram-settings";
import { useModelAccessController } from "./use-model-access-controller";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	fetchMock.mockReset();
	// Default response for model-access-options: empty options list
	fetchMock.mockResolvedValue(
		new Response(
			JSON.stringify({
				options: [],
				activeOptionId: null,
			}),
			{
				status: 200,
				headers: { "content-type": "application/json" },
			},
		),
	);
});

describe("TelegramSettings", () => {
	it("shows the current connected bot summary", () => {
		render(
			<TelegramSettings
				initialAccess={null}
				initialConfig={{
					botUsername: "hermes_helper_bot",
					botTokenLast4: "1234",
					isActive: true,
					deployedServerHost: null,
				}}
			/>,
		);

		expect(screen.getByText(/hermes_helper_bot/i)).toBeTruthy();
		expect(screen.getByText(/paste a new one to replace it/i)).toBeTruthy();
		expect(screen.getByPlaceholderText("••••1234")).toBeTruthy();
	});

	it("connects a Telegram bot and shows the success state", async () => {
		render(<TelegramSettings initialAccess={null} initialConfig={null} />);

		fireEvent.change(screen.getByLabelText(/bot token/i), {
			target: { value: "123456:secret-token" },
		});
		fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));

		await flushAsyncWork();

		expect(screen.getByText(/telegram bot connected/i)).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/telegram/connect",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("disconnects the bot from the current session", async () => {
		fetchMock
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						telegram: {
							botUsername: "hermes_helper_bot",
							botTokenLast4: "1234",
							isActive: true,
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ status: "disconnected" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);

		render(
			<TelegramSettings
				initialAccess={null}
				initialConfig={{
					botUsername: "hermes_helper_bot",
					botTokenLast4: "1234",
					isActive: true,
					deployedServerHost: null,
				}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));

		await flushAsyncWork();

		expect(screen.getByText(/telegram bot disconnected/i)).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/telegram/disconnect",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("loads pending Telegram pairing requests and approves one from the list", async () => {
		fetchMock
			// model-access-options (the model-access-section mounts)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ options: [], activeOptionId: null }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						pairings: {
							pending: [
								{
									code: "ABCD2345",
									userId: "123456",
									userName: "Dung",
									ageMinutes: 1,
								},
							],
							approved: [],
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			);
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					approved: {
						userId: "123456",
						userName: "Dung",
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					pairings: {
						pending: [],
						approved: [
							{
								userId: "123456",
								userName: "Dung",
								approvedAt: 1780243682,
							},
						],
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(
			<TelegramSettings
				initialAccess={null}
				initialConfig={{
					botUsername: "hermes_helper_bot",
					botTokenLast4: "1234",
					isActive: true,
					deployedServerHost: "95.111.232.131",
				}}
			/>,
		);

		await flushAsyncWork();

		expect(screen.getByText("ABCD2345")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /approve abcd2345/i }));

		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/telegram/pairings/approve",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ code: "ABCD2345" }),
			}),
		);
	});

	it("approves a Telegram pairing code", async () => {
		fetchMock
			// model-access-options (section mounts)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ options: [], activeOptionId: null }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						pairings: {
							pending: [],
							approved: [],
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			);
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					approved: {
						userId: "123456",
						userName: "Dung",
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					pairings: {
						pending: [],
						approved: [
							{
								userId: "123456",
								userName: "Dung",
								approvedAt: 1780243682,
							},
						],
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(
			<TelegramSettings
				initialAccess={null}
				initialConfig={{
					botUsername: "hermes_helper_bot",
					botTokenLast4: "1234",
					isActive: true,
					deployedServerHost: "95.111.232.131",
				}}
			/>,
		);

		fireEvent.change(screen.getByLabelText(/pairing code/i), {
			target: { value: "rgts8s2r" },
		});
		const approveButton = screen.getByRole("button", { name: /^approve$/i });
		expect((approveButton as HTMLButtonElement).disabled).toBe(false);
		fireEvent.click(approveButton);

		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/telegram/pairings/approve",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ code: "RGTS8S2R" }),
			}),
		);
	});

	it("refetches the route loader after a successful model switch", async () => {
		fetchMock
			// mount fetch: model-access-options
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						options: [
							{
								optionId: "opt-openai",
								kind: "api-provider",
								label: "OpenAI",
								model: "gpt-4o-mini",
								isActive: false,
							},
						],
						activeOptionId: null,
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			)
			// POST model-switch
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ status: "switched" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			)
			// post-switch refresh of model-access-options
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						options: [
							{
								optionId: "opt-openai",
								kind: "api-provider",
								label: "OpenAI",
								model: "gpt-4o-mini",
								isActive: true,
							},
						],
						activeOptionId: "opt-openai",
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			);

		routerSpies.invalidate.mockClear();

		render(
			<TelegramSettings
				initialAccess={null}
				initialConfig={{
					botUsername: "hermes_helper_bot",
					botTokenLast4: "1234",
					isActive: true,
					deployedServerHost: "95.111.232.131",
				}}
			/>,
		);

		await flushAsyncWork();

		// Pick the saved OpenAI option and switch.
		fireEvent.change(screen.getByLabelText(/provider \/ subscription/i), {
			target: { value: "opt-openai" },
		});
		fireEvent.click(screen.getByRole("button", { name: /^switch$/i }));

		await flushAsyncWork();

		// The fix for the sidebar staying stale after a switch: TelegramSettings
		// must invalidate the route loader so `initialAccess?.activeBackend`
		// re-reads the new active backend and the deploy button enables.
		expect(routerSpies.invalidate).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/telegram/model-switch",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					optionId: "opt-openai",
					model: "gpt-4o-mini",
				}),
			}),
		);
		// Plan 002: the success banner must survive the post-switch options refresh.
		// fetchStarted must not clear state.message, or React 19 batching collapses
		// both dispatches into one commit and the banner never visibly renders.
		expect(
			screen.getByText(/model access switched successfully/i),
		).toBeTruthy();
		// Re-assert after another tick to confirm the banner is stable (not a
		// one-frame flash observed before the refresh lands).
		await flushAsyncWork();
		expect(
			screen.getByText(/model access switched successfully/i),
		).toBeTruthy();
	});

	it("fetches model-access options when isDeployed flips from false to true", async () => {
		// Directly exercises the controller (renderHook) because the flip must
		// happen without unmounting it: TelegramSettings holds savedConfig in
		// useState, so re-rendering with a new initialConfig would not change
		// isDeployed, and a key-remount would mask the bug (a fresh mount with
		// isDeployed=true would fetch even under the old one-shot behavior).
		const { rerender } = renderHook(
			({ isDeployed }: { isDeployed: boolean }) =>
				useModelAccessController({ isDeployed, onSwitched: undefined }),
			{ initialProps: { isDeployed: false } },
		);

		// Arriving on the page without a deployed bot must NOT fetch yet.
		expect(fetchMock).not.toHaveBeenCalledWith(
			"/api/telegram/model-access-options",
		);

		// Connecting + deploying flips isDeployed true: the effect must refire.
		rerender({ isDeployed: true });
		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/telegram/model-access-options",
		);
	});

	it("does not invalidate the route loader when model switch fails", async () => {
		// NOTE: with isDeployed=true the mount fires TWO fetches — model-access-
		// options (controller) and pairings (pairing section) — so the 502 must be
		// the THIRD queued response; a mis-placed 502 would be consumed by a mount
		// fetch and the switch would then succeed against the default 200 mock.
		fetchMock
			// mount fetch 1: model-access-options
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						options: [
							{
								optionId: "opt-openai",
								kind: "api-provider",
								label: "OpenAI",
								model: "gpt-4o-mini",
								isActive: false,
							},
						],
						activeOptionId: null,
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			)
			// mount fetch 2: pairings
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						pairings: { pending: [], approved: [] },
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			)
			// POST model-switch -> 502
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: "Server unreachable" }), {
					status: 502,
					headers: { "content-type": "application/json" },
				}),
			);

		routerSpies.invalidate.mockClear();

		render(
			<TelegramSettings
				initialAccess={null}
				initialConfig={{
					botUsername: "hermes_helper_bot",
					botTokenLast4: "1234",
					isActive: true,
					deployedServerHost: "95.111.232.131",
				}}
			/>,
		);

		await flushAsyncWork();

		fireEvent.change(screen.getByLabelText(/provider \/ subscription/i), {
			target: { value: "opt-openai" },
		});
		fireEvent.click(screen.getByRole("button", { name: /^switch$/i }));
		await flushAsyncWork();

		// Failure paths must NOT trigger the route-loader invalidation.
		// A successful switch would; a 502 (above) must not.
		expect(routerSpies.invalidate).not.toHaveBeenCalled();
		expect(
			screen.queryByText(/model access switched successfully/i),
		).toBeNull();
		// Positively confirm the failure path rendered (not silently swallowed).
		expect(screen.getByText(/server unreachable/i)).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/telegram/model-switch",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("keeps the real router exports available under the partial mock", () => {
		// Plan 009: the partial mock (vi.importActual) must expose the real router
		// exports — the old broad mock resolved them to `undefined`, which is the
		// silent-break risk this plan removes.
		expect(Link).toBeDefined();
		expect(Outlet).toBeDefined();
	});
});

async function flushAsyncWork() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}
