// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () => {
	const { createStartMock } = await import("#/test-helpers/route-mocks");
	return createStartMock();
});

vi.mock("@tanstack/react-router", async () => {
	const { createRouterMock } = await import("#/test-helpers/route-mocks");
	return createRouterMock();
});

vi.mock("#/lib/session", async () => {
	const { createSessionResolverMock } = await import(
		"#/test-helpers/route-mocks"
	);
	return createSessionResolverMock();
});

vi.mock("@tanstack/react-start/server", async () => {
	const { createStartServerMock } = await import("#/test-helpers/route-mocks");
	return createStartServerMock();
});

vi.mock("#server/auth", () => ({
	getAuthSession: vi.fn(),
}));

vi.mock("#server/settings", () => ({
	getCurrentPersonaSettings: vi.fn(),
}));

vi.mock("#server/settings/mcp", () => ({
	getCurrentMcpServers: vi.fn(),
}));

vi.mock("#server/settings/agent-skills/records", () => ({
	getCurrentAgentSkills: vi.fn(),
}));

vi.mock("#/lib/load-hermes-deployment-targets", () => ({
	loadHermesDeploymentTargets: vi.fn(() => Promise.resolve([])),
}));

import {
	assertRouteComponent,
	createMockSession,
} from "#/test-helpers/route-mocks";
import { getAuthSession } from "#server/auth";
import { getCurrentPersonaSettings } from "#server/settings";
import { getCurrentAgentSkills } from "#server/settings/agent-skills/records";
import { getCurrentMcpServers } from "#server/settings/mcp";
import { Route } from "./settings";

describe("/settings route", () => {
	it("renders SettingsPage component", () => {
		assertRouteComponent(Route, "SettingsPage");
	});

	it("has beforeLoad defined for auth guard", () => {
		expect(Route.options?.beforeLoad).toBeDefined();
	});

	it("loads all settings data in beforeLoad", async () => {
		vi.mocked(getAuthSession).mockResolvedValue(createMockSession());
		vi.mocked(getCurrentPersonaSettings).mockResolvedValue({
			agentPersona: "You are Hermes.",
			updatedAt: "2026-06-16T00:00:00.000Z",
		});
		vi.mocked(getCurrentMcpServers).mockResolvedValue([]);
		vi.mocked(getCurrentAgentSkills).mockResolvedValue([]);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/settings" },
		} as never);

		expect(result).toHaveProperty("session");
		expect(result).toHaveProperty("personaSettings");
		expect(result.personaSettings).toHaveProperty("agentPersona");
		expect(result).toHaveProperty("mcpServers");
		expect(result).toHaveProperty("agentSkills");
		expect(result).toHaveProperty("deploymentTargets");
	});

	it("returns null persona settings when none saved", async () => {
		vi.mocked(getAuthSession).mockResolvedValue(createMockSession());
		vi.mocked(getCurrentPersonaSettings).mockResolvedValue(null);
		vi.mocked(getCurrentMcpServers).mockResolvedValue([]);
		vi.mocked(getCurrentAgentSkills).mockResolvedValue([]);

		// biome-ignore lint/style/noNonNullAssertion: mock requires non-null for callability
		const result = await Route.options.beforeLoad!({
			location: { href: "/settings" },
		} as never);

		expect(result.personaSettings).toBeNull();
		expect(result.mcpServers).toEqual([]);
	});
});
