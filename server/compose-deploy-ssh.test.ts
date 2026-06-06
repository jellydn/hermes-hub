import { describe, expect, it } from "vitest";

import {
	assertValidComposeServiceNames,
	buildComposeUpCommand,
} from "./compose-deploy-ssh";

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

	it("force-recreates the Web UI so stale env vars are replaced on redeploy", () => {
		expect(
			buildComposeUpCommand({
				composeServices: ["hermes-webui"],
				pull: true,
				forceRecreate: true,
			}),
		).toBe(
			"cd ~/hermes && sudo docker compose pull hermes-webui && sudo docker compose up -d --force-recreate --no-deps hermes-webui",
		);
	});

	it("rejects invalid compose service names", () => {
		expect(() =>
			assertValidComposeServiceNames(["hermes-webui"]),
		).not.toThrow();
		expect(() => assertValidComposeServiceNames(["hermes;rm -rf /"])).toThrow(
			/invalid compose service name/i,
		);
		expect(() =>
			buildComposeUpCommand({ composeServices: ["hermes$(whoami)"] }),
		).toThrow(/invalid compose service name/i);
	});
});
