import type { NodeSSH } from "node-ssh";

import { managedComposeVolumeHome } from "../constants";

export const HERMES_CONFIG_PATH = `${managedComposeVolumeHome}/.hermes/config.yaml`;

export function buildHermesConfigWriteCommand(content: string): string {
	const encoded = Buffer.from(content, "utf8").toString("base64");

	return [
		`sudo mkdir -p ${managedComposeVolumeHome}/.hermes`,
		`printf '%s' '${encoded}' | base64 -d | sudo tee ${HERMES_CONFIG_PATH} > /dev/null`,
		`sudo chown hermes:hermes ${HERMES_CONFIG_PATH} 2>/dev/null || true`,
	].join(" && ");
}

export async function readHermesConfigYaml(ssh: NodeSSH): Promise<string> {
	const result = await ssh.execCommand(
		`sudo cat ${HERMES_CONFIG_PATH} 2>/dev/null || true`,
	);
	return result.stdout ?? "";
}

export async function writeHermesConfigYaml(
	ssh: NodeSSH,
	content: string,
): Promise<void> {
	const result = await ssh.execCommand(buildHermesConfigWriteCommand(content));
	if (result.code !== 0) {
		throw new Error(result.stderr || "Failed to write Hermes config.yaml");
	}
}
