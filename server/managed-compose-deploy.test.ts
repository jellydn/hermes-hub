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

vi.mock("./compose-deploy-ssh", () => ({
	deployComposeViaSsh,
}));

vi.mock("./hermes/runtime", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./hermes/runtime")>();
	return {
		...actual,
		assertWebUiReachable,
	};
});

import {
	hermesAgentSourcePathInContainer,
	hermesContainerName,
	hermesWebUiAgentHostDir,
	hermesWebUiContainerGid,
	hermesWebUiContainerUid,
	managedComposeVolumeHome,
} from "./constants";
import { buildWebUiAgentSourceSyncCommand } from "./hermes/runtime";
import {
	deployManagedCompose,
	resolveManagedComposeDeployPolicy,
} from "./managed-compose-deploy";

describe("resolveManagedComposeDeployPolicy", () => {
	it("uses full-stack compose for telegram deploys", () => {
		expect(resolveManagedComposeDeployPolicy("telegram")).toEqual({
			intent: "telegram",
		});
	});

	it("uses full-stack compose and model config for provider deploys", () => {
		const policy = resolveManagedComposeDeployPolicy("provider", {
			providerModel: "gpt-4o",
		});

		expect(policy).toMatchObject({
			intent: "provider",
		});
		expect(policy.extraSshCommands).toBeTypeOf("function");
	});

	it("scopes web-ui deploys to hermes-webui with workspace prep and reachability checks", () => {
		const policy = resolveManagedComposeDeployPolicy("web-ui", {
			webUiPort: 8787,
		});

		expect(policy).toEqual({
			intent: "web-ui",
			composeServices: ["hermes-webui"],
			pullImages: true,
			forceRecreate: true,
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

	it("builds the agent source sync command with copy and chown steps", () => {
		expect(buildWebUiAgentSourceSyncCommand()).toBe(
			[
				`sudo mkdir -p ${managedComposeVolumeHome}/.hermes ${managedComposeVolumeHome}/.hermes/webui ${managedComposeVolumeHome}/workspace`,
				`sudo rm -rf ${hermesWebUiAgentHostDir}`,
				`sudo docker cp ${hermesContainerName}:${hermesAgentSourcePathInContainer} ${hermesWebUiAgentHostDir}`,
				`sudo chown -R ${hermesWebUiContainerUid}:${hermesWebUiContainerGid} ${managedComposeVolumeHome}/.hermes ${managedComposeVolumeHome}/workspace`,
			].join(" && "),
		);
	});

	it("syncs Hermes agent source before Web UI deploy", async () => {
		const execCommand = vi
			.fn()
			.mockResolvedValueOnce({ code: 0, stdout: `${hermesContainerName}\n` })
			.mockResolvedValueOnce({ code: 0, stdout: "" })
			.mockResolvedValueOnce({ code: 0, stdout: "" });
		const policy = resolveManagedComposeDeployPolicy("web-ui", {
			webUiPort: 8787,
		});

		await policy.preSshCommands?.({ execCommand } as never);

		expect(execCommand).toHaveBeenNthCalledWith(
			1,
			`sudo docker ps --filter name=^/${hermesContainerName}$ --filter status=running --format '{{.Names}}'`,
		);
		expect(execCommand).toHaveBeenNthCalledWith(
			2,
			`sudo docker exec ${hermesContainerName} test -d ${hermesAgentSourcePathInContainer}`,
		);
		expect(execCommand).toHaveBeenNthCalledWith(
			3,
			buildWebUiAgentSourceSyncCommand(),
		);
	});

	it("fails clearly when the Hermes container is not running", async () => {
		const execCommand = vi.fn().mockResolvedValueOnce({ code: 0, stdout: "" });
		const policy = resolveManagedComposeDeployPolicy("web-ui", {
			webUiPort: 8787,
		});

		await expect(
			policy.preSshCommands?.({ execCommand } as never),
		).rejects.toThrow(/Hermes container is not running/i);
	});

	it("fails clearly when Hermes agent source is missing in the container", async () => {
		const execCommand = vi
			.fn()
			.mockResolvedValueOnce({ code: 0, stdout: `${hermesContainerName}\n` })
			.mockResolvedValueOnce({ code: 1, stderr: "directory missing" });
		const policy = resolveManagedComposeDeployPolicy("web-ui", {
			webUiPort: 8787,
		});

		await expect(
			policy.preSshCommands?.({ execCommand } as never),
		).rejects.toThrow(
			new RegExp(
				`Hermes agent source \\(${hermesAgentSourcePathInContainer}\\) is missing`,
			),
		);
	});

	it("fails clearly when agent source sync fails", async () => {
		const execCommand = vi
			.fn()
			.mockResolvedValueOnce({ code: 0, stdout: `${hermesContainerName}\n` })
			.mockResolvedValueOnce({ code: 0, stdout: "" })
			.mockResolvedValueOnce({
				code: 1,
				stderr: "docker cp failed: no such directory",
			});
		const policy = resolveManagedComposeDeployPolicy("web-ui", {
			webUiPort: 8787,
		});

		await expect(
			policy.preSshCommands?.({ execCommand } as never),
		).rejects.toThrow(/docker cp failed/i);
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
			webUiPort: 8787,
		});
		expect(deployComposeViaSsh).toHaveBeenCalledWith(
			expect.objectContaining({
				host: "203.0.113.10",
				composeServices: ["hermes-webui"],
				pullImages: true,
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
			"sudo docker exec hermes hermes config set model 'gpt-4o'",
		);
	});
});
