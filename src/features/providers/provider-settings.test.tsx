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
		AlertCircle: MockIcon,
		CheckCircle2: MockIcon,
		Circle: MockIcon,
		CloudUpload: MockIcon,
		Cpu: MockIcon,
		Info: MockIcon,
		TriangleAlert: MockIcon,
		KeyRound: MockIcon,
		LoaderCircle: MockIcon,
		Radio: MockIcon,
		Server: MockIcon,
		ShieldCheck: MockIcon,
		Sparkles: MockIcon,
	};
});

vi.mock("#/components/ui/button", () => ({
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

const invalidateMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({
		invalidate: invalidateMock,
	}),
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

function getApiSection() {
	const apiSection = screen
		.getByRole("heading", { name: /api keys/i })
		.closest("section");
	if (!apiSection) {
		throw new Error("Expected API provider section to render.");
	}
	return apiSection;
}

function getSubSection() {
	const subSection = screen
		.getByRole("heading", { name: /subscriptions/i })
		.closest("section");
	if (!subSection) {
		throw new Error("Expected subscriptions section to render.");
	}
	return subSection;
}

function getAside() {
	const aside = document.querySelector("aside");
	if (!aside) {
		throw new Error("Expected sidebar aside to render.");
	}
	return aside;
}

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

		const apiSection = getApiSection();

		expect(
			within(apiSection).getByText(/stored key ending in 1234/i),
		).toBeTruthy();
		expect(screen.getByText(/^active runtime$/i)).toBeTruthy();
		expect(within(apiSection).getByDisplayValue("gpt-4o-mini")).toBeTruthy();
	});

	it("switches to a custom model field for OpenRouter", () => {
		render(<ProviderSettings initialAccess={null} />);
		const apiSection = getApiSection();

		fireEvent.click(
			within(apiSection).getByRole("radio", { name: /openrouter/i }),
		);

		expect(within(apiSection).getByLabelText(/custom model id/i)).toBeTruthy();
		expect(within(apiSection).queryByRole("combobox")).toBeNull();
		expect(
			within(apiSection).getByDisplayValue("openai/gpt-4o-mini"),
		).toBeTruthy();
	});

	it("tests the provider connection and shows the connected state", async () => {
		render(<ProviderSettings initialAccess={null} />);
		const apiSection = getApiSection();

		fireEvent.change(within(apiSection).getByLabelText(/api key/i), {
			target: { value: "sk-live-secret" },
		});
		fireEvent.click(
			within(apiSection).getByRole("button", { name: /test connection/i }),
		);

		await flushAsyncWork();

		expect(within(apiSection).getByText(/^provider connected$/i)).toBeTruthy();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/providers/test",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("shows Base URL and Custom Model fields when Ollama is selected", () => {
		render(<ProviderSettings initialAccess={null} />);
		const apiSection = getApiSection();

		fireEvent.click(
			within(apiSection).getByRole("radio", { name: /ollama \/ local/i }),
		);

		expect(within(apiSection).getByLabelText(/base url/i)).toBeTruthy();
		expect(within(apiSection).getByLabelText(/custom model id/i)).toBeTruthy();
		expect(
			within(apiSection).getByDisplayValue("http://localhost:11434/v1"),
		).toBeTruthy();
		expect(within(apiSection).getByDisplayValue("llama3")).toBeTruthy();
	});

	it("does not show ChatGPT or MiMo in the API provider grid", () => {
		render(<ProviderSettings initialAccess={null} />);
		const apiSection = getApiSection();

		expect(
			within(apiSection).queryByRole("radio", {
				name: /openai codex \/ chatgpt/i,
			}),
		).toBeNull();
		expect(
			within(apiSection).queryByRole("radio", {
				name: /xiaomi mimo token plan/i,
			}),
		).toBeNull();
		expect(screen.getByRole("heading", { name: /api keys/i })).toBeTruthy();
	});

	it("shows MiMo Token Plan controls in the subscriptions section", () => {
		render(<ProviderSettings initialAccess={null} />);
		const subSection = getSubSection();

		fireEvent.click(
			within(subSection).getByRole("radio", {
				name: /xiaomi mimo token plan/i,
			}),
		);

		expect(within(subSection).getByLabelText(/api key/i)).toBeTruthy();
		expect(within(subSection).getByLabelText(/base url/i)).toBeTruthy();
		expect(within(subSection).getByDisplayValue("mimo-v2.5-pro")).toBeTruthy();
		expect(
			within(subSection).getByDisplayValue(
				"https://token-plan-cn.xiaomimimo.com/v1",
			),
		).toBeTruthy();
		expect(
			within(subSection).getByRole("button", { name: /test connection/i }),
		).toBeTruthy();
	});

	it("shows saved MiMo config in the subscription panel and sidebar", () => {
		render(
			<ProviderSettings
				initialAccess={{
					apiProvider: null,
					subscription: {
						kind: "subscription",
						subscriptionProvider: "mimo",
						model: "mimo-v2.5-pro",
						authMode: "mimo-token-plan",
						keyLast4: "1234",
						hasStoredKey: true,
						baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
					},
					activeBackend: "subscription",
				}}
			/>,
		);

		const subSection = getSubSection();
		const aside = getAside();

		expect(
			within(subSection).getByText(/stored key ending in 1234/i),
		).toBeTruthy();
		expect(screen.getByText(/^active runtime$/i)).toBeTruthy();
		expect(within(aside).getByRole("heading", { name: /mimo/i })).toBeTruthy();
	});

	it("marks the active backend in the sidebar", () => {
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

		const aside = getAside();

		expect(screen.getByText(/^active runtime$/i)).toBeTruthy();
		expect(
			within(aside).getByRole("heading", { name: /openai/i }),
		).toBeTruthy();
	});

	it("hides the API key field in the subscription section for ChatGPT", async () => {
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

		expect(document.getElementById("subscription-api-key")).toBeNull();
		expect(
			screen.getAllByText(/chatgpt device-code login/i).length,
		).toBeGreaterThanOrEqual(2);
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

async function flushAsyncWork() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}
