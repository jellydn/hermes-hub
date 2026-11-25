import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultHermesImage, legacyDefaultHermesImages } from "./constants";
import { mockDockerHost } from "./hermes/runtime/test-helpers";

const withSshConnection = vi.fn();
vi.mock("./ssh", () => ({ withSshConnection }));

const compose = `services:\n  hermes:\n    image: ${defaultHermesImage}\n  hermes-webui: {}\n`;
const legacyImage = legacyDefaultHermesImages[0] ?? "";

async function deployWebUi(host: ReturnType<typeof mockDockerHost>) {
	withSshConnection.mockImplementation(async (_input, run) => run(host));
	const { deployComposeViaSsh } = await import("./compose-deploy-ssh");
	await deployComposeViaSsh({
		host: "203.0.113.10",
		port: 22,
		username: "root",
		authMethod: "password",
		credential: "secret",
		composeContent: compose,
		composeServices: ["hermes-webui"],
		pullImages: true,
		forceRecreate: true,
	});
	return host.execCommand.mock.calls.map(([cmd]) => String(cmd)).at(-1);
}

describe("deployComposeViaSsh", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("also recreates hermes when the compose file moves it off a legacy image", async () => {
		const upCommand = await deployWebUi(
			mockDockerHost({
				composeImage: legacyImage,
				containerImage: legacyImage,
			}),
		);

		expect(upCommand).toBe(
			"cd ~/hermes && sudo docker compose pull hermes-webui hermes && sudo docker compose up -d --force-recreate --no-deps hermes-webui hermes",
		);
	});

	it("recreates hermes when compose and the container already disagree", async () => {
		const upCommand = await deployWebUi(
			mockDockerHost({
				composeImage: defaultHermesImage,
				containerImage: legacyImage,
			}),
		);

		expect(upCommand).toContain("--no-deps hermes-webui hermes");
	});

	it("leaves hermes running when it already runs the compose image", async () => {
		const upCommand = await deployWebUi(
			mockDockerHost({
				composeImage: defaultHermesImage,
				containerImage: defaultHermesImage,
			}),
		);

		expect(upCommand).toBe(
			"cd ~/hermes && sudo docker compose pull hermes-webui && sudo docker compose up -d --force-recreate --no-deps hermes-webui",
		);
	});
});
