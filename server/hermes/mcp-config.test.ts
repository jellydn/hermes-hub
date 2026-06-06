import { describe, expect, it } from "vitest";

import { buildHermesConfigWriteCommand } from "./mcp-config";

describe("buildHermesConfigWriteCommand", () => {
	it("base64-encodes config content for safe shell transfer", () => {
		const command = buildHermesConfigWriteCommand(
			"model: gpt-4o-mini\nmcp_servers:\n  github:\n    command: npx",
		);

		expect(command).toContain("sudo mkdir -p /root/.hermes");
		expect(command).toContain("printf '%s' '");
		expect(command).toContain(
			"| base64 -d | sudo tee /root/.hermes/config.yaml",
		);
		expect(command).not.toContain("gpt-4o-mini");
	});
});
