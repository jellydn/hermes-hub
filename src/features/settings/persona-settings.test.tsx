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

import { PersonaSettings } from "./persona-settings";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

const primaryTarget = {
	serverId: "server_1",
	label: "Primary",
	host: "1.2.3.4",
	installUpdatedAt: "2026-06-06T12:00:00.000Z",
};

const backupTarget = {
	serverId: "server_2",
	label: "Backup",
	host: "5.6.7.8",
	installUpdatedAt: "2026-06-05T12:00:00.000Z",
};

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
				deploymentTargets={[primaryTarget]}
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

		render(<PersonaSettings initialSettings={null} deploymentTargets={[]} />);

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

	it("renders a deployment target selector and posts serverId on deploy", async () => {
		render(
			<PersonaSettings
				initialSettings={{
					agentPersona: "You are Hermes.",
					updatedAt: "2026-06-06T12:00:00.000Z",
				}}
				deploymentTargets={[primaryTarget, backupTarget]}
			/>,
		);

		expect(screen.getByLabelText(/deploy target/i)).toBeTruthy();

		const deployButton = screen.getByRole("button", {
			name: /deploy to hermes server/i,
		});
		expect(deployButton.hasAttribute("disabled")).toBe(false);

		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					status: "deployed",
					serverId: "server_2",
					serverHost: "5.6.7.8",
					deployedAt: "2026-06-06T12:00:00.000Z",
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		fireEvent.change(screen.getByLabelText(/deploy target/i), {
			target: { value: "server_2" },
		});
		fireEvent.click(deployButton);
		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/settings/persona/deploy",
			expect.objectContaining({
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ serverId: "server_2" }),
			}),
		);
		expect(
			screen.getByText((content) => content.startsWith("Persona deployed to ")),
		).toBeTruthy();
	});

	it("shows install-first messaging when no deployment targets exist", () => {
		render(
			<PersonaSettings
				initialSettings={{
					agentPersona: "You are Hermes.",
					updatedAt: "2026-06-06T12:00:00.000Z",
				}}
				deploymentTargets={[]}
			/>,
		);

		expect(screen.getByText(/install hermes on a server first/i)).toBeTruthy();
		expect(screen.queryByLabelText(/deploy target/i)).toBeNull();
	});

	it("shows a network error when save fails", async () => {
		fetchMock.mockRejectedValueOnce(new Error("Network failure"));

		render(<PersonaSettings initialSettings={null} deploymentTargets={[]} />);

		fireEvent.change(screen.getByLabelText(/persona content/i), {
			target: { value: "Saved persona" },
		});
		fireEvent.click(screen.getByRole("button", { name: /save persona/i }));

		await flushAsyncWork();

		expect(
			screen.getByText(
				/network error\. please check your connection and try again\./i,
			),
		).toBeTruthy();
	});

	it("shows a network error when deploy fails", async () => {
		fetchMock.mockRejectedValueOnce(new Error("Network failure"));

		render(
			<PersonaSettings
				initialSettings={{
					agentPersona: "You are Hermes.",
					updatedAt: "2026-06-06T12:00:00.000Z",
				}}
				deploymentTargets={[primaryTarget]}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /deploy to hermes server/i }),
		);
		await flushAsyncWork();

		expect(
			screen.getByText(
				/network error\. please check your connection and try again\./i,
			),
		).toBeTruthy();
	});

	it("keeps deploy disabled when no persona is saved", () => {
		render(
			<PersonaSettings
				initialSettings={null}
				deploymentTargets={[primaryTarget]}
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
