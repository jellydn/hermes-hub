// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TelegramSettings } from "./telegram-settings";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	fetchMock.mockReset();
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
					deployedServerHost: null,
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

		await flushAsyncWork();

		expect(screen.getByText(/telegram bot connected/i)).toBeTruthy();
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
					deployedServerHost: null,
				}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));

		await flushAsyncWork();

		expect(screen.getByText(/telegram bot disconnected/i)).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/telegram/disconnect",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("loads pending Telegram pairing requests and approves one from the list", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					pairings: {
						pending: [
							{
								code: "ABCD2345",
								userId: "123456",
								userName: "Dung",
								ageMinutes: 1,
							},
						],
						approved: [],
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					approved: {
						userId: "123456",
						userName: "Dung",
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					pairings: {
						pending: [],
						approved: [
							{
								userId: "123456",
								userName: "Dung",
								approvedAt: 1780243682,
							},
						],
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(
			<TelegramSettings
				initialConfig={{
					botUsername: "hermes_helper_bot",
					botTokenLast4: "1234",
					isActive: true,
					deployedServerHost: "95.111.232.131",
				}}
			/>,
		);

		await flushAsyncWork();

		expect(screen.getByText("ABCD2345")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /approve abcd2345/i }));

		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/telegram/pairings/approve",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ code: "ABCD2345" }),
			}),
		);
	});

	it("approves a Telegram pairing code", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					pairings: {
						pending: [],
						approved: [],
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					approved: {
						userId: "123456",
						userName: "Dung",
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					pairings: {
						pending: [],
						approved: [
							{
								userId: "123456",
								userName: "Dung",
								approvedAt: 1780243682,
							},
						],
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(
			<TelegramSettings
				initialConfig={{
					botUsername: "hermes_helper_bot",
					botTokenLast4: "1234",
					isActive: true,
					deployedServerHost: "95.111.232.131",
				}}
			/>,
		);

		fireEvent.change(screen.getByLabelText(/pairing code/i), {
			target: { value: "rgts8s2r" },
		});
		const approveButton = screen.getByRole("button", { name: /^approve$/i });
		expect((approveButton as HTMLButtonElement).disabled).toBe(false);
		fireEvent.click(approveButton);

		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/telegram/pairings/approve",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ code: "RGTS8S2R" }),
			}),
		);
	});
});

async function flushAsyncWork() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}
