import type { NodeSSH } from "node-ssh";
import { hermesImageRepository } from "../../constants";
import { shellQuote } from "../../ssh";

// ── Gateway lifecycle ────────────────────────────────────────────

export async function restartGateway(ssh: NodeSSH): Promise<string> {
	const result = await ssh.execCommand(
		"cd ~/hermes && sudo docker compose restart hermes",
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || "Failed to restart Hermes");
	}
	return result.stdout.trim();
}

export async function updateGateway(ssh: NodeSSH): Promise<string> {
	const result = await ssh.execCommand(
		"cd ~/hermes && sudo docker compose pull hermes && sudo docker compose up -d --no-deps hermes",
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || "Failed to update Hermes");
	}
	return result.stdout.trim();
}

const DOCKER_TAG_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

export function isValidDockerTag(tag: string): boolean {
	return DOCKER_TAG_PATTERN.test(tag);
}

export async function rollbackGateway(
	ssh: NodeSSH,
	imageTag: string,
): Promise<string> {
	const tag = imageTag.trim() || "latest";
	if (!isValidDockerTag(tag)) {
		throw new Error(`Invalid image tag: ${tag}`);
	}

	const command = [
		"cd ~/hermes",
		`sudo docker pull ${hermesImageRepository}:${tag}`,
		`sudo sed -i.bak 's|image: ${hermesImageRepository}:.*|image: ${hermesImageRepository}:${tag}|' docker-compose.yml`,
		"sudo docker compose up -d --no-deps hermes",
	].join(" && ");

	const result = await ssh.execCommand(command);
	if (result.code !== 0) {
		throw new Error(result.stderr || "Failed to roll back Hermes");
	}
	return result.stdout.trim();
}

// ── Provider config ──────────────────────────────────────────────

export async function setProviderModel(
	ssh: NodeSSH,
	model: string,
): Promise<void> {
	await ssh.execCommand("sleep 2");

	const result = await ssh.execCommand(
		`sudo docker exec hermes hermes config set model ${shellQuote(model)}`,
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || "Failed to set model inside Hermes");
	}
}

export async function setProviderInferenceProvider(
	ssh: NodeSSH,
	provider: string,
): Promise<void> {
	const result = await ssh.execCommand(
		`sudo docker exec hermes hermes config set model.provider ${shellQuote(
			provider,
		)}`,
	);
	if (result.code !== 0) {
		throw new Error(
			result.stderr || "Failed to set model.provider inside Hermes",
		);
	}
}
