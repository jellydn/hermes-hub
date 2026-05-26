import { describe, expect, it } from "vitest";

import {
	getHealthTone,
	toAgentSummary,
	toProviderSummary,
	toTelegramSummary,
} from "./dashboard";

describe("dashboard helpers", () => {
	it("marks the agent online only after a successful install", () => {
		const summary = toAgentSummary(
			{ status: "connected" },
			{ status: "succeeded", updatedAt: new Date("2026-05-26T03:00:00.000Z") },
		);

		expect(summary.status).toBe("online");
		expect(summary.updatedAt).toBe("2026-05-26T03:00:00.000Z");
	});

	it("marks resource pressure as warning when any metric is high", () => {
		expect(getHealthTone({ cpu: 91, memory: 42, disk: 55 })).toBe("warning");
		expect(getHealthTone({ cpu: 24, memory: 42, disk: 55 })).toBe("healthy");
	});

	it("formats connected provider and Telegram summaries", () => {
		expect(
			toProviderSummary({
				provider: "openai",
				model: "gpt-4o-mini",
				isActive: true,
			}),
		).toMatchObject({
			status: "connected",
			provider: "openai",
			model: "gpt-4o-mini",
		});

		expect(
			toTelegramSummary({
				chatId: "hermes_helper_bot",
				isActive: true,
			}),
		).toMatchObject({
			status: "connected",
			botUsername: "hermes_helper_bot",
		});
	});
});
