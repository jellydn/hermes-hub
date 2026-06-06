import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	buildManagedComposeContent,
	deployComposeViaSsh,
	assertWebUiReachable,
} = vi.hoisted(() => ({
	buildManagedComposeContent: vi.fn(),
	deployComposeViaSsh: vi.fn(),
	assertWebUiReachable: vi.fn(),
}));

vi.mock("./server-compose", () => ({
	buildManagedComposeContent,
}));

vi.mock("./deploy", () => ({
	deployComposeViaSsh,
}));

vi.mock("./web-ui/reachability", () => ({
	assertWebUiReachable,
}));

import {
	deployManagedCompose,
	resolveManagedComposeDeployPolicy,
} from "./managed-compose-deploy";

describe("resolveManagedComposeDeployPolicy", () => {
	it("uses full-stack compose for telegram deploys", () => {
		expect(resolveManagedComposeDeployPolicy("telegram")).toEqual({
			intent: "telegram",
			webUiMode: "preserve",
		});
	});

	it("uses full-stack compose and model config for provider deploys", () => {
		const policy = resolveManagedComposeDeployPolicy("provider", {
			providerModel: "gpt-4o",
		});

		expect(policy).toMatchObject({
			intent: "provider",
			webUiMode: "preserve",
		});
		expect(policy.extraSshCommands).toBeTypeOf("function");
	});

	it("scopes web-ui deploys to hermes-webui with workspace prep and reachability checks", () => {
		const policy = resolveManagedComposeDeployPolicy("web-ui", {
			webUiPort: 8787,
		});

		expect(policy).toEqual({
			intent: "web-ui",
			webUiMode: "preserve",
			composeServices: ["hermes-webui"],
			preSshCommands: expect.any(Function),
			extraSshCommands: expect.any(Function),
		});
	});

	it("requires providerModel for provider intent", () => {
		expect(() => resolveManagedComposeDeployPolicy("provider")).toThrow(
			/providerModel is required/i,
		);
	});

	it("requires webUiPort for web-ui intent", () => {
		expect(() => resolveManagedComposeDeployPolicy("web-ui")).toThrow(
			/webUiPort is required/i,
		);
	});

	it("prepares sudo docker volume directories before Web UI deploy", async () => {
		const execCommand = vi.fn().mockResolvedValue({ code: 0, stdout: "" });
		const policy = resolveManagedComposeDeployPolicy("web-ui", {
			webUiPort: 8787,
		});

		await policy.preSshCommands?.({ execCommand } as never);

		expect(execCommand).toHaveBeenCalledWith(
			"sudo mkdir -p /root/.hermes /root/workspace",
		);
	});
});

describe("deployManagedCompose", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		buildManagedComposeContent.mockResolvedValue("services:\n  hermes: {}");
		deployComposeViaSsh.mockResolvedValue(undefined);
	});

	it("builds compose content and deploys with the web-ui policy", async () => {
		await deployManagedCompose({
			intent: "web-ui",
			userId: "user_1",
			serverId: "server_1",
			host: "203.0.113.10",
			port: 22,
			username: "root",
			authMethod: "password",
			credential: "secret",
			webUiPassword: "ui-password",
			webUiPort: 8787,
		});

		expect(buildManagedComposeContent).toHaveBeenCalledWith({
			userId: "user_1",
			serverId: "server_1",
			apiServerKey: undefined,
			telegramBotToken: undefined,
			webUiPassword: "ui-password",
			webUiMode: "preserve",
		});
		expect(deployComposeViaSsh).toHaveBeenCalledWith(
			expect.objectContaining({
				host: "203.0.113.10",
				composeServices: ["hermes-webui"],
				preSshCommands: expect.any(Function),
				extraSshCommands: expect.any(Function),
			}),
		);
	});

	it("runs provider post-up model configuration", async () => {
		const execCommand = vi.fn().mockResolvedValue({ code: 0, stdout: "" });

		await deployManagedCompose({
			intent: "provider",
			userId: "user_1",
			serverId: "server_1",
			host: "203.0.113.10",
			port: 22,
			username: "root",
			authMethod: "ssh-key",
			credential: "secret",
			apiServerKey: "api-key",
			providerModel: "gpt-4o",
		});

		const policy = resolveManagedComposeDeployPolicy("provider", {
			providerModel: "gpt-4o",
		});
		await policy.extraSshCommands?.({ execCommand } as never);

		expect(execCommand).toHaveBeenNthCalledWith(1, "sleep 2");
		expect(execCommand).toHaveBeenNthCalledWith(
			2,
			"docker exec hermes hermes config set model 'gpt-4o'",
		);
	});
});
