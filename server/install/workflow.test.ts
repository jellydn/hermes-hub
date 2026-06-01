import { describe, expect, it } from "vitest";
import { buildDockerInstallCommand, installStepIds } from "./workflow";

describe("install workflow", () => {
	describe("installStepIds", () => {
		it("uses the canonical step names from the install workflow", () => {
			expect(installStepIds).toEqual([
				"install-docker",
				"verify-docker",
				"create-hermes-directory",
				"write-compose-file",
				"pull-image",
				"start-containers",
			]);
		});
	});

	describe("buildDockerInstallCommand", () => {
		const command = buildDockerInstallCommand();

		it("is a no-op verify when docker is already installed", () => {
			expect(command).toContain("if command -v docker >/dev/null 2>&1");
			expect(command).toContain("Docker already installed");
		});

		it("uses the Ubuntu apt repo when ID=ubuntu", () => {
			expect(command).toContain("https://download.docker.com/linux/ubuntu");
			expect(command).toContain('if [ "$ID" = "ubuntu" ]');
		});

		it("uses the Debian apt repo when ID=debian", () => {
			expect(command).toContain("https://download.docker.com/linux/debian");
			expect(command).toContain('if [ "$ID" = "debian" ]');
		});

		it("falls back to get.docker.com for unsupported distros with a warning", () => {
			expect(command).toContain("https://get.docker.com");
			expect(command).toContain("WARNING: unsupported distro");
			expect(command).toContain("get.docker.com | sudo sh");
		});
	});
});
