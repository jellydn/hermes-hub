// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { ComponentPropsWithoutRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", () => {
	const MockIcon = (props: Record<string, unknown>) => <svg {...props} />;
	return {
		CheckCircle2: MockIcon,
		CloudUpload: MockIcon,
		KeyRound: MockIcon,
		LoaderCircle: MockIcon,
		Radio: MockIcon,
		Server: MockIcon,
		ShieldCheck: MockIcon,
	};
});

vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		type = "button",
		...props
	}: ComponentPropsWithoutRef<"button">) => (
		<button type={type} disabled={disabled} onClick={onClick} {...props}>
			{children}
		</button>
	),
}));

import { ProviderSettings } from "./provider-settings";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	fetchMock.mockResolvedValue(
		new Response(JSON.stringify({ status: "connected" }), {
			status: 200,
			headers: { "content-type": "application/json" },
		}),
	);
});

describe("ProviderSettings", () => {
	it("shows a masked stored key and keeps the saved API provider visible", () => {
		render(
			<ProviderSettings
				initialAccess={{
					apiProvider: {
						kind: "api-provider",
						provider: "openai",
						model: "gpt-4o-mini",
						keyLast4: "1234",
						hasStoredKey: true,
					},
					subscription: null,
					activeBackend: "api-provider",
				}}
			/>,
		);

		expect(screen.getByText(/^stored key ending in 1234$/i)).toBeTruthy();
		expect(screen.getByText(/^active model access$/i)).toBeTruthy();
		expect(screen.getByDisplayValue("gpt-4o-mini")).toBeTruthy();
	});

	it("switches to a custom model field for OpenRouter", () => {
		render(<ProviderSettings initialAccess={null} />);
		selectApiProvidersTab();

		const apiSection = screen
			.getByRole("heading", { name: /connect with an api key/i })
			.closest("section");
		if (!apiSection) {
			throw new Error("Expected API provider section to render.");
		}

		fireEvent.click(screen.getByRole("radio", { name: /openrouter/i }));

		expect(within(apiSection).getByLabelText(/custom model id/i)).toBeTruthy();
		expect(within(apiSection).queryByRole("combobox")).toBeNull();
		expect(screen.getByDisplayValue("openai/gpt-4o-mini")).toBeTruthy();
	});

	it("tests the provider connection and shows the connected state", async () => {
		render(<ProviderSettings initialAccess={null} />);
		selectApiProvidersTab();

		fireEvent.change(screen.getByLabelText(/api key/i), {
			target: { value: "sk-live-secret" },
		});
		fireEvent.click(screen.getByRole("button", { name: /test connection/i }));

		await flushAsyncWork();

		expect(screen.getByText(/^provider connected$/i)).toBeTruthy();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/providers/test",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("shows Base URL and Custom Model fields when Ollama is selected", () => {
		render(<ProviderSettings initialAccess={null} />);
		selectApiProvidersTab();

		fireEvent.click(screen.getByRole("radio", { name: /ollama \/ local/i }));

		expect(screen.getByLabelText(/base url/i)).toBeTruthy();
		expect(screen.getByLabelText(/custom model id/i)).toBeTruthy();
		expect(screen.getByDisplayValue("http://localhost:11434/v1")).toBeTruthy();
		expect(screen.getByDisplayValue("llama3")).toBeTruthy();
	});

	it("does not show ChatGPT in the API provider grid", () => {
		render(<ProviderSettings initialAccess={null} />);
		selectApiProvidersTab();

		expect(
			screen.queryByRole("radio", { name: /openai codex \/ chatgpt/i }),
		).toBeNull();
		expect(
			screen.getByRole("tab", { name: /user subscriptions/i }),
		).toBeTruthy();
	});

	it("marks the active backend on the matching tab", () => {
		render(
			<ProviderSettings
				initialAccess={{
					apiProvider: {
						kind: "api-provider",
						provider: "openai",
						model: "gpt-4o-mini",
						keyLast4: "1234",
						hasStoredKey: true,
					},
					subscription: null,
					activeBackend: "api-provider",
				}}
			/>,
		);

		const apiTab = screen.getByRole("tab", { name: /api providers/i });
		expect(within(apiTab).getByText(/^active$/i)).toBeTruthy();
	});

	it("hides the API key field in the subscription section", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					codexAuth: {
						authenticated: false,
						authMode: null,
						lastRefresh: null,
						serverHost: "1.2.3.4",
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(
			<ProviderSettings
				initialAccess={null}
				telegramDeploy={{
					deployedServerHost: "1.2.3.4",
				}}
			/>,
		);

		await flushAsyncWork();

		expect(screen.queryByLabelText(/api key/i)).toBeNull();
		expect(
			screen.getAllByText(/chatgpt device-code login/i).length,
		).toBeGreaterThan(0);

		selectApiProvidersTab();

		expect(screen.getAllByLabelText(/api key/i)).toHaveLength(1);
	});

	it("enables ChatGPT deploy when remote auth is already authenticated", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					codexAuth: {
						authenticated: true,
						authMode: "chatgpt",
						lastRefresh: "2026-06-06T12:00:00.000Z",
						serverHost: "1.2.3.4",
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(
			<ProviderSettings
				initialAccess={{
					apiProvider: null,
					subscription: {
						kind: "subscription",
						subscriptionProvider: "chatgpt",
						model: "gpt-5.4-mini",
						authMode: "chatgpt",
					},
					activeBackend: "subscription",
				}}
				telegramDeploy={{
					deployedServerHost: "1.2.3.4",
				}}
			/>,
		);

		await flushAsyncWork();

		const deployButton = screen.getByRole("button", {
			name: /deploy to hermes server/i,
		});
		expect(deployButton).toHaveProperty("disabled", false);
		expect(screen.getAllByText(/gpt-5\.4-mini/i).length).toBeGreaterThan(0);
	});

	it("disables ChatGPT deploy until remote auth succeeds", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					codexAuth: {
						authenticated: false,
						authMode: null,
						lastRefresh: null,
						serverHost: "1.2.3.4",
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(
			<ProviderSettings
				initialAccess={{
					apiProvider: null,
					subscription: {
						kind: "subscription",
						subscriptionProvider: "chatgpt",
						model: "gpt-5.5",
						authMode: "chatgpt",
					},
					activeBackend: "subscription",
				}}
				telegramDeploy={{
					deployedServerHost: "1.2.3.4",
				}}
			/>,
		);

		await flushAsyncWork();

		const deployButton = screen.getByRole("button", {
			name: /deploy to hermes server/i,
		});
		expect(deployButton).toHaveProperty("disabled", true);
		expect(
			screen.getByText(
				/complete chatgpt device-code login before deploying to hermes/i,
			),
		).toBeTruthy();
	});
});

function selectApiProvidersTab() {
	fireEvent.click(screen.getByRole("tab", { name: /api providers/i }));
}

async function flushAsyncWork() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}
