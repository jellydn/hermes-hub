// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TelegramSettings } from "./telegram-settings";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	fetchMock.mockResolvedValue(
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
	);
});

describe("TelegramSettings", () => {
	it("shows the current connected bot summary", () => {
		render(
			<TelegramSettings
				initialConfig={{
					botUsername: "hermes_helper_bot",
					botTokenLast4: "1234",
					isActive: true,
				}}
			/>,
		);

		expect(screen.getByText(/hermes_helper_bot/i)).toBeTruthy();
		expect(screen.getByText(/paste a new one to replace it/i)).toBeTruthy();
		expect(screen.getByPlaceholderText("••••1234")).toBeTruthy();
	});

	it("connects a Telegram bot and shows the success state", async () => {
		render(<TelegramSettings initialConfig={null} />);

		fireEvent.change(screen.getByLabelText(/bot token/i), {
			target: { value: "123456:secret-token" },
		});
		fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));

		await waitFor(() => {
			expect(screen.getByText(/telegram bot connected/i)).toBeTruthy();
		});

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
				initialConfig={{
					botUsername: "hermes_helper_bot",
					botTokenLast4: "1234",
					isActive: true,
				}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));

		await waitFor(() => {
			expect(screen.getByText(/telegram bot disconnected/i)).toBeTruthy();
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/telegram/disconnect",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});
});
