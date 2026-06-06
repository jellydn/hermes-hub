import { describe, expect, it } from "vitest";

import {
	aggregateHealthCheckStatus,
	buildHealthCheckResult,
	type HealthCheckCommandOutput,
} from "./parse";

function createHealthyOutput(): HealthCheckCommandOutput {
	return {
		uptime: "up 2 days, 3 hours",
		cpu: "24",
		memory: "42",
		disk: "55",
		dockerAvailable: "yes",
		dockerDaemon: "yes",
		dockerCompose: "yes",
		hermesWorkspace: "yes",
		hermesComposeFile: "yes",
		hermesReachability: "200",
	};
}

describe("health check parsing", () => {
	it("builds a healthy result when the VPS harness is ready", () => {
		const result = buildHealthCheckResult(
			createHealthyOutput(),
			"2026-06-06T12:00:00.000Z",
			{ hermesRunning: true },
		);

		expect(result.status).toBe("healthy");
		expect(result.checkedAt).toBe("2026-06-06T12:00:00.000Z");
		expect(result.groups).toHaveLength(2);
		expect(result.groups.flatMap((group) => group.items)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "CPU",
					status: "healthy",
				}),
				expect.objectContaining({
					label: "Hermes agent responding",
					status: "healthy",
				}),
				expect.objectContaining({
					label: "Hermes configuration",
					status: "healthy",
				}),
			]),
		);
	});

	it("marks hot resources as warning and saturated resources as critical", () => {
		const warningResult = buildHealthCheckResult(
			{
				...createHealthyOutput(),
				cpu: "88",
			},
			"2026-06-06T12:00:00.000Z",
			{ hermesRunning: true },
		);

		expect(warningResult.status).toBe("warning");

		const criticalResult = buildHealthCheckResult(
			{
				...createHealthyOutput(),
				disk: "97",
			},
			"2026-06-06T12:00:00.000Z",
			{ hermesRunning: true },
		);

		expect(criticalResult.status).toBe("critical");
	});

	it("marks missing harness pieces as critical", () => {
		const result = buildHealthCheckResult(
			{
				...createHealthyOutput(),
				cpu: "not-a-number",
				dockerDaemon: "no",
				dockerCompose: "no",
				hermesWorkspace: "no",
				hermesComposeFile: "no",
				hermesReachability: "000",
			},
			"2026-06-06T12:00:00.000Z",
			{ hermesRunning: true },
		);

		expect(result.status).toBe("critical");
		expect(
			result.groups
				.find((group) => group.label === "Server resources")
				?.items.find((item) => item.label === "CPU"),
		).toMatchObject({
			status: "critical",
		});
		expect(
			result.groups
				.find((group) => group.label === "Hermes setup")
				?.items.find((item) => item.label === "Docker running"),
		).toMatchObject({
			status: "critical",
		});
		expect(
			result.groups
				.find((group) => group.label === "Hermes setup")
				?.items.find((item) => item.label === "Hermes folder"),
		).toMatchObject({
			status: "critical",
			detail: expect.stringContaining("workspace folder is missing"),
		});
	});

	it("omits Hermes agent response when the container is not running", () => {
		const result = buildHealthCheckResult(
			{
				...createHealthyOutput(),
				hermesReachability: "000",
			},
			"2026-06-06T12:00:00.000Z",
			{ hermesRunning: false },
		);

		expect(
			result.groups
				.find((group) => group.label === "Hermes setup")
				?.items.map((item) => item.label),
		).toEqual([
			"Docker installed",
			"Docker running",
			"Docker Compose ready",
			"Hermes folder",
			"Hermes configuration",
			"Hermes agent running",
		]);
	});

	it("aggregates the most severe item status", () => {
		expect(
			aggregateHealthCheckStatus([
				{ label: "CPU", status: "healthy", detail: "ok" },
				{ label: "Disk", status: "warning", detail: "hot" },
			]),
		).toBe("warning");
		expect(
			aggregateHealthCheckStatus([
				{ label: "CPU", status: "warning", detail: "hot" },
				{ label: "Disk", status: "critical", detail: "full" },
			]),
		).toBe("critical");
	});
});
