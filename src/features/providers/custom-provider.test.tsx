import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
