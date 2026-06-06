import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

const { decryptSecret } = vi.hoisted(() => ({
	decryptSecret: vi.fn(),
}));

vi.mock("./secrets", () => ({
	decryptSecretMap: (map: Record<string, { encrypted: string }>) =>
		Object.fromEntries(
			Object.entries(map).map(([key, entry]) => [
				key,
				decryptSecret(entry.encrypted),
			]),
		),
}));

import {
	buildMcpServersConfig,
	InvalidHermesConfigYamlError,
	mergeHermesConfigMcpServers,
	parseExistingHermesConfigYaml,
} from "./yaml";

describe("mcp yaml", () => {
	it("builds stdio and HTTP server entries", () => {
		decryptSecret.mockImplementation((value: string) =>
			value.replace("enc:", ""),
		);

		const yamlConfig = buildMcpServersConfig([
			{
				id: "server_1",
				userId: "user_1",
				name: "github",
				transport: "stdio",
				enabled: true,
				command: "npx",
				args: ["-y", "@modelcontextprotocol/server-github"],
				url: null,
				encryptedEnv: {
					GITHUB_PERSONAL_ACCESS_TOKEN: {
						encrypted: "enc:token1234",
						last4: "1234",
					},
				},
				encryptedHeaders: {},
				toolsInclude: ["create_issue"],
				toolsExclude: [],
				toolsResources: false,
				toolsPrompts: true,
				timeout: 120,
				connectTimeout: 60,
				supportsParallelToolCalls: true,
				createdAt: new Date("2026-06-06T12:00:00.000Z"),
				updatedAt: new Date("2026-06-06T12:00:00.000Z"),
			},
			{
				id: "server_2",
				userId: "user_1",
				name: "stripe",
				transport: "http",
				enabled: false,
				command: null,
				args: [],
				url: "https://mcp.stripe.com",
				encryptedEnv: {},
				encryptedHeaders: {
					Authorization: {
						encrypted: "enc:Bearer secret",
						last4: "cret",
					},
				},
				toolsInclude: [],
				toolsExclude: ["delete_customer"],
				toolsResources: true,
				toolsPrompts: false,
				timeout: null,
				connectTimeout: null,
				supportsParallelToolCalls: false,
				createdAt: new Date("2026-06-06T12:00:00.000Z"),
				updatedAt: new Date("2026-06-06T12:00:00.000Z"),
			},
		]);

		expect(yamlConfig.github).toMatchObject({
			enabled: true,
			command: "npx",
			args: ["-y", "@modelcontextprotocol/server-github"],
			env: {
				GITHUB_PERSONAL_ACCESS_TOKEN: "token1234",
			},
			timeout: 120,
			connect_timeout: 60,
			supports_parallel_tool_calls: true,
			tools: {
				include: ["create_issue"],
				resources: false,
			},
		});

		expect(yamlConfig.stripe).toMatchObject({
			enabled: false,
			url: "https://mcp.stripe.com",
			headers: {
				Authorization: "Bearer secret",
			},
			tools: {
				exclude: ["delete_customer"],
				prompts: false,
			},
		});
	});

	it("rejects invalid existing YAML instead of wiping remote config", () => {
		expect(() =>
			mergeHermesConfigMcpServers("model: [broken", {
				github: { enabled: true },
			}),
		).toThrow(InvalidHermesConfigYamlError);

		expect(() => parseExistingHermesConfigYaml("- just\n- a\n- list")).toThrow(
			InvalidHermesConfigYamlError,
		);
	});

	it("replaces only mcp_servers while preserving other config keys", () => {
		const merged = mergeHermesConfigMcpServers(
			[
				"model: gpt-4o-mini",
				"gateway:",
				"  port: 8642",
				"mcp_servers:",
				"  legacy:",
				"    url: https://old.example.com",
			].join("\n"),
			{
				github: {
					command: "npx",
					enabled: true,
				},
			},
		);

		const parsed = parse(merged) as {
			model: string;
			gateway: { port: number };
			mcp_servers: Record<string, unknown>;
		};

		expect(parsed.model).toBe("gpt-4o-mini");
		expect(parsed.gateway).toEqual({ port: 8642 });
		expect(parsed.mcp_servers).toEqual({
			github: {
				command: "npx",
				enabled: true,
			},
		});
	});
});
