import { describe, expect, it } from "vitest";

import { buildLogLinesFromEvents } from "./log-lines";

describe("buildLogLinesFromEvents", () => {
	it("formats structured install events into log lines", () => {
		const lines = buildLogLinesFromEvents([
			{
				step: "install-docker",
				message: "Installing Docker",
				createdAt: new Date("2026-05-26T03:00:00.000Z"),
			},
		]);

		expect(lines).toEqual([
			"2026-05-26T03:00:00.000Z [install-docker] Installing Docker",
		]);
	});

	it("returns an empty array when there are no events", () => {
		expect(buildLogLinesFromEvents([])).toEqual([]);
	});
});
