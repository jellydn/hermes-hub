import { afterEach, describe, expect, it, vi } from "vitest";

import { isStaleDeploy } from "./stale-deploy";

afterEach(() => {
	vi.useRealTimers();
});

describe("isStaleDeploy", () => {
	it("returns true when deployStartedAt is null (legacy row)", () => {
		expect(isStaleDeploy(null)).toBe(true);
	});

	it("returns false when deploy started recently (within threshold)", () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const startedAt = new Date(now.getTime() - 9 * 60 * 1000);
		expect(isStaleDeploy(startedAt)).toBe(false);
	});

	it("returns true when deploy started longer than the threshold", () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const startedAt = new Date(now.getTime() - 11 * 60 * 1000);
		expect(isStaleDeploy(startedAt)).toBe(true);
	});

	it("returns false exactly at the threshold boundary", () => {
		const now = new Date("2026-06-06T12:00:00.000Z");
		vi.useFakeTimers();
		vi.setSystemTime(now);

		const startedAt = new Date(now.getTime() - 10 * 60 * 1000);
		expect(isStaleDeploy(startedAt)).toBe(false);
	});
});
