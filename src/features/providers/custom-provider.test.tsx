// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentPropsWithoutRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
	cleanup();
});

describe("ProviderSettings - custom provider", () => {
	it("selects custom provider without crashing", () => {
		render(<ProviderSettings initialConfig={null} />);

		fireEvent.click(screen.getByRole("radio", { name: /custom \/ byo/i }));

		expect(screen.getByLabelText(/api key/i)).toBeTruthy();
		expect(screen.getByLabelText(/base url/i)).toBeTruthy();
		expect(screen.getByLabelText(/custom model id/i)).toBeTruthy();
	});

	it("loads saved custom config without crashing", () => {
		render(
			<ProviderSettings
				initialConfig={{
					provider: "custom",
					model: "deepseek-chat",
					keyLast4: null,
					hasStoredKey: true,
					baseUrl: "https://api.deepseek.com/v1",
				}}
			/>,
		);

		expect(screen.getByLabelText(/api key/i)).toBeTruthy();
		expect(screen.getByLabelText(/base url/i)).toBeTruthy();
		expect(screen.getByLabelText(/custom model id/i)).toBeTruthy();
		expect(screen.getByDisplayValue("deepseek-chat")).toBeTruthy();
	});

	it("loads saved custom config with empty model without crashing", () => {
		render(
			<ProviderSettings
				initialConfig={{
					provider: "custom",
					model: "",
					keyLast4: null,
					hasStoredKey: true,
					baseUrl: "",
				}}
			/>,
		);

		expect(screen.getByLabelText(/api key/i)).toBeTruthy();
		expect(screen.getByLabelText(/base url/i)).toBeTruthy();
		expect(screen.getByLabelText(/custom model id/i)).toBeTruthy();
	});

	it("loads saved custom config with baseUrl undefined without crashing", () => {
		render(
			<ProviderSettings
				initialConfig={{
					provider: "custom",
					model: "",
					keyLast4: null,
					hasStoredKey: true,
				}}
			/>,
		);

		expect(screen.getByLabelText(/api key/i)).toBeTruthy();
		expect(screen.getByLabelText(/base url/i)).toBeTruthy();
		expect(screen.getByLabelText(/custom model id/i)).toBeTruthy();
	});
});
