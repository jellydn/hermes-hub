// @vitest-environment happy-dom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { ComponentPropsWithoutRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
	cleanup();
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

describe("ProviderSettings - custom provider", () => {
	it("selects custom provider without crashing", () => {
		render(<ProviderSettings initialAccess={null} />);
		const apiSection = getApiSection();

		fireEvent.click(
			within(apiSection).getByRole("radio", { name: /custom \/ byo/i }),
		);

		expect(within(apiSection).getByLabelText(/api key/i)).toBeTruthy();
		expect(within(apiSection).getByLabelText(/base url/i)).toBeTruthy();
		expect(within(apiSection).getByLabelText(/^model$/i)).toBeTruthy();
	});

	it("loads saved custom config without crashing", () => {
		render(
			<ProviderSettings
				initialAccess={{
					apiProvider: {
						kind: "api-provider",
						provider: "custom",
						model: "deepseek-chat",
						keyLast4: null,
						hasStoredKey: true,
						baseUrl: "https://api.deepseek.com/v1",
					},
					subscription: null,
					activeBackend: "api-provider",
				}}
			/>,
		);
		const apiSection = getApiSection();

		expect(within(apiSection).getByLabelText(/api key/i)).toBeTruthy();
		expect(within(apiSection).getByLabelText(/base url/i)).toBeTruthy();
		expect(within(apiSection).getByLabelText(/^model$/i)).toBeTruthy();
		expect(within(apiSection).getByDisplayValue("deepseek-chat")).toBeTruthy();
	});

	it("loads saved custom config with empty model without crashing", () => {
		render(
			<ProviderSettings
				initialAccess={{
					apiProvider: {
						kind: "api-provider",
						provider: "custom",
						model: "",
						keyLast4: null,
						hasStoredKey: true,
						baseUrl: "",
					},
					subscription: null,
					activeBackend: "api-provider",
				}}
			/>,
		);
		const apiSection = getApiSection();

		expect(within(apiSection).getByLabelText(/api key/i)).toBeTruthy();
		expect(within(apiSection).getByLabelText(/base url/i)).toBeTruthy();
		expect(within(apiSection).getByLabelText(/^model$/i)).toBeTruthy();
	});

	it("loads saved custom config with baseUrl undefined without crashing", () => {
		render(
			<ProviderSettings
				initialAccess={{
					apiProvider: {
						kind: "api-provider",
						provider: "custom",
						model: "",
						keyLast4: null,
						hasStoredKey: true,
					},
					subscription: null,
					activeBackend: "api-provider",
				}}
			/>,
		);
		const apiSection = getApiSection();

		expect(within(apiSection).getByLabelText(/api key/i)).toBeTruthy();
		expect(within(apiSection).getByLabelText(/base url/i)).toBeTruthy();
		expect(within(apiSection).getByLabelText(/^model$/i)).toBeTruthy();
	});
});
