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
		CloudUpload: MockIcon,
		LoaderCircle: MockIcon,
		Save: MockIcon,
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

import { PersonaSettings } from "./persona-settings";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	fetchMock.mockResolvedValue(
		new Response(JSON.stringify({ status: "ok" }), {
			status: 200,
			headers: { "content-type": "application/json" },
		}),
	);
});

describe("PersonaSettings", () => {
	it("renders saved persona content", () => {
		render(
			<PersonaSettings
				initialSettings={{
					agentPersona: "You are Hermes.",
					updatedAt: "2026-06-06T12:00:00.000Z",
				}}
			/>,
		);

		expect(screen.getByDisplayValue("You are Hermes.")).toBeTruthy();
		expect(screen.getByText(/last saved:/i)).toBeTruthy();
	});

	it("posts persona content on save and shows success state", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					settings: {
						agentPersona: "Saved persona",
						updatedAt: "2026-06-06T12:00:00.000Z",
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(<PersonaSettings initialSettings={null} />);

		fireEvent.change(screen.getByLabelText(/persona content/i), {
			target: { value: "Saved persona" },
		});
		fireEvent.click(screen.getByRole("button", { name: /save persona/i }));

		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/settings/persona",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ agentPersona: "Saved persona" }),
			}),
		);
		expect(screen.getByText(/^persona saved\.$/i)).toBeTruthy();
	});

	it("disables deploy until persona is saved and shows deploy success", async () => {
		render(
			<PersonaSettings
				initialSettings={{
					agentPersona: "You are Hermes.",
					updatedAt: "2026-06-06T12:00:00.000Z",
				}}
				telegramDeploy={{ deployedServerHost: "1.2.3.4" }}
			/>,
		);

		const deployButton = screen.getByRole("button", {
			name: /deploy to hermes server/i,
		});
		expect(deployButton.hasAttribute("disabled")).toBe(false);

		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					status: "deployed",
					serverHost: "1.2.3.4",
					deployedAt: "2026-06-06T12:00:00.000Z",
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		fireEvent.click(deployButton);
		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/settings/persona/deploy",
			expect.objectContaining({ method: "POST" }),
		);
		expect(screen.getByText(/persona deployed to 1\.2\.3\.4/i)).toBeTruthy();
	});

	it("keeps deploy disabled when no persona is saved", () => {
		render(
			<PersonaSettings
				initialSettings={null}
				telegramDeploy={{ deployedServerHost: "1.2.3.4" }}
			/>,
		);

		const deployButton = screen.getByRole("button", {
			name: /deploy to hermes server/i,
		});
		expect(deployButton.hasAttribute("disabled")).toBe(true);
	});
});

async function flushAsyncWork() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}
