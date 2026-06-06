// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
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
	it("shows a masked stored key and keeps the saved provider visible", () => {
		render(
			<ProviderSettings
				initialConfig={{
					provider: "openai",
					model: "gpt-4o-mini",
					keyLast4: "1234",
					hasStoredKey: true,
				}}
			/>,
		);

		expect(screen.getByText(/^stored key ending in 1234$/i)).toBeTruthy();
		expect(screen.queryByText(/no provider connected/i)).toBeNull();
		expect(screen.getByDisplayValue("gpt-4o-mini")).toBeTruthy();
	});

	it("switches to a custom model field for OpenRouter", () => {
		render(<ProviderSettings initialConfig={null} />);

		fireEvent.click(screen.getByRole("radio", { name: /openrouter/i }));

		expect(screen.getByLabelText(/custom model id/i)).toBeTruthy();
		expect(screen.queryByLabelText(/^model$/i)).toBeNull();
		expect(screen.getByDisplayValue("openai/gpt-4o-mini")).toBeTruthy();
	});

	it("tests the provider connection and shows the connected state", async () => {
		render(<ProviderSettings initialConfig={null} />);

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
		render(<ProviderSettings initialConfig={null} />);

		fireEvent.click(screen.getByRole("radio", { name: /ollama \/ local/i }));

		expect(screen.getByLabelText(/base url/i)).toBeTruthy();
		expect(screen.getByLabelText(/custom model id/i)).toBeTruthy();
		expect(screen.getByDisplayValue("http://localhost:11434/v1")).toBeTruthy();
		expect(screen.getByDisplayValue("llama3")).toBeTruthy();
	});

	it("hides the API key field and test button for OpenAI Codex", async () => {
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
				initialConfig={null}
				telegramDeploy={{
					deployedServerHost: "1.2.3.4",
				}}
			/>,
		);

		fireEvent.click(
			screen.getByRole("radio", { name: /openai codex \/ chatgpt/i }),
		);

		await flushAsyncWork();

		expect(screen.queryByLabelText(/api key/i)).toBeNull();
		expect(
			screen.queryByRole("button", { name: /test connection/i }),
		).toBeNull();
		expect(screen.getByText(/chatgpt device-code login/i)).toBeTruthy();
	});

	it("disables Codex deploy until remote auth succeeds", async () => {
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
				initialConfig={{
					provider: "openai-codex",
					model: "gpt-5.5",
					keyLast4: null,
					hasStoredKey: true,
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
				/complete chatgpt device-code login before deploying codex/i,
			),
		).toBeTruthy();
	});
});

async function flushAsyncWork() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}
