import { describe, expect, it } from "vitest";

import { buildComposeUpCommand } from "./deploy";

describe("buildComposeUpCommand", () => {
	it("recreates the full stack when no services are targeted", () => {
		expect(buildComposeUpCommand()).toBe(
			"cd ~/hermes && sudo docker compose up -d",
		);
	});

	it("targets only the requested services without restarting dependencies", () => {
		expect(buildComposeUpCommand({ composeServices: ["hermes-webui"] })).toBe(
			"cd ~/hermes && sudo docker compose up -d --no-deps hermes-webui",
		);
	});

	it("pulls the Web UI image before recreating only that service", () => {
		expect(
			buildComposeUpCommand({
				composeServices: ["hermes-webui"],
				pull: true,
			}),
		).toBe(
			"cd ~/hermes && sudo docker compose pull hermes-webui && sudo docker compose up -d --no-deps hermes-webui",
		);
	});
});
