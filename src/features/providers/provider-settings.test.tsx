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
});

async function flushAsyncWork() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}
