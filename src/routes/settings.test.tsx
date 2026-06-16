// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (fn: Function) => fn,
	}),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: Record<string, unknown>) => ({
		options: { beforeLoad: config.beforeLoad },
		component: config.component,
	}),
	getRouteApi: () => ({
		useRouteContext: () => ({}),
		useSearch: () => ({}),
		useParams: () => ({}),
		useLoaderData: () => ({}),
	}),
	Link: ({ children, to, ...props }: Record<string, unknown>) =>
		React.createElement("a", { href: to, ...props }, children),
	useNavigate: () => vi.fn(),
}));

import React from "react";

vi.mock("#/lib/session", () => ({
	requireSession: vi.fn(() =>
		Promise.resolve({
			user: { id: "user_1", email: "test@example.com", image: null },
			session: { id: "session_1" },
		}),
	),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: vi.fn(() => ({})),
}));

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

import { Route } from "./settings";
import { getAuthSession } from "#server/auth";
import { getCurrentPersonaSettings } from "#server/settings";
import { getCurrentMcpServers } from "#server/settings/mcp";
import { getCurrentAgentSkills } from "#server/settings/agent-skills/records";

describe("/settings route", () => {
	it("renders SettingsPage component", () => {
		expect(Route.component?.name).toBe("SettingsPage");
	});

	it("has beforeLoad defined for auth guard", () => {
		expect(Route.options?.beforeLoad).toBeDefined();
	});

	it("loads all settings data in beforeLoad", async () => {
		vi.mocked(getAuthSession).mockResolvedValue({
			user: { id: "user_1" },
			session: { id: "session_1" },
		});
		vi.mocked(getCurrentPersonaSettings).mockResolvedValue({
			agentPersona: "You are Hermes.",
			updatedAt: "2026-06-16T00:00:00.000Z",
		});
		vi.mocked(getCurrentMcpServers).mockResolvedValue([]);
		vi.mocked(getCurrentAgentSkills).mockResolvedValue([]);

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
		vi.mocked(getAuthSession).mockResolvedValue({
			user: { id: "user_1" },
			session: { id: "session_1" },
		});
		vi.mocked(getCurrentPersonaSettings).mockResolvedValue(null);
		vi.mocked(getCurrentMcpServers).mockResolvedValue([]);
		vi.mocked(getCurrentAgentSkills).mockResolvedValue([]);

		const result = await Route.options.beforeLoad!({
			location: { href: "/settings" },
		} as never);

		expect(result.personaSettings).toBeNull();
		expect(result.mcpServers).toEqual([]);
	});
});
