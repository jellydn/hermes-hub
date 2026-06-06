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
		hermesContainer: "hermes",
		hermesReachability: "200",
		sshPasswordAuth: "no",
		sshRootLogin: "no",
		firewall: "Status: active",
		securityUpdates: "0",
	};
}

describe("health check parsing", () => {
	it("builds a healthy result when all checks pass", () => {
		const result = buildHealthCheckResult(
			createHealthyOutput(),
			"2026-06-06T12:00:00.000Z",
		);

		expect(result.status).toBe("healthy");
		expect(result.checkedAt).toBe("2026-06-06T12:00:00.000Z");
		expect(result.groups).toHaveLength(3);
		expect(result.groups.flatMap((group) => group.items)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "CPU usage",
					status: "healthy",
				}),
				expect.objectContaining({
					label: "Hermes reachability",
					status: "healthy",
				}),
			]),
		);
	});

	it("marks hot resources as warning", () => {
		const result = buildHealthCheckResult(
			{
				...createHealthyOutput(),
				cpu: "88",
			},
			"2026-06-06T12:00:00.000Z",
		);

		expect(result.status).toBe("warning");
		expect(
			result.groups
				.find((group) => group.label === "System")
				?.items.find((item) => item.label === "CPU usage"),
		).toMatchObject({
			status: "warning",
			detail: "88% used",
		});
	});

	it("marks critical runtime and malformed output states", () => {
		const result = buildHealthCheckResult(
			{
				...createHealthyOutput(),
				cpu: "not-a-number",
				dockerDaemon: "no",
				hermesContainer: "",
				hermesReachability: "000",
			},
			"2026-06-06T12:00:00.000Z",
		);

		expect(result.status).toBe("critical");
		expect(
			result.groups
				.find((group) => group.label === "System")
				?.items.find((item) => item.label === "CPU usage"),
		).toMatchObject({
			status: "critical",
		});
		expect(
			result.groups
				.find((group) => group.label === "Runtime")
				?.items.find((item) => item.label === "Docker daemon"),
		).toMatchObject({
			status: "critical",
		});
	});

	it("flags security posture gaps as warning", () => {
		const result = buildHealthCheckResult(
			{
				...createHealthyOutput(),
				sshPasswordAuth: "yes",
				sshRootLogin: "yes",
				firewall: "Status: inactive",
				securityUpdates: "3",
			},
			"2026-06-06T12:00:00.000Z",
		);

		expect(result.status).toBe("warning");
		expect(
			result.groups
				.find((group) => group.label === "Security posture")
				?.items.map((item) => item.status),
		).toEqual(["warning", "warning", "warning", "warning"]);
	});

	it("skips Hermes reachability when the container is not running", () => {
		const result = buildHealthCheckResult(
			{
				...createHealthyOutput(),
				hermesContainer: "",
				hermesReachability: "000",
			},
			"2026-06-06T12:00:00.000Z",
		);

		expect(
			result.groups
				.find((group) => group.label === "Runtime")
				?.items.find((item) => item.label === "Hermes reachability"),
		).toMatchObject({
			status: "warning",
			detail: "Skipped because the Hermes container is not running.",
		});
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
