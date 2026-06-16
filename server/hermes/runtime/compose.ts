import { randomUUID } from "node:crypto";
import type { NodeSSH } from "node-ssh";

// ── Compose deployment ───────────────────────────────────────────

const COMPOSE_SERVICE_NAME = /^[A-Za-z0-9_.-]+$/;

export function assertValidComposeServiceNames(serviceNames: string[]): void {
	for (const name of serviceNames) {
		if (!COMPOSE_SERVICE_NAME.test(name)) {
			throw new Error(`Invalid compose service name: ${name}`);
		}
	}
}

export async function writeComposeFile(
	ssh: NodeSSH,
	content: string,
): Promise<void> {
	const delimiter = `HERMES_COMPOSE_${randomUUID()}`;
	const writeCmd = `cat > ~/hermes/docker-compose.yml << '${delimiter}'\n${content}\n${delimiter}`;

	const result = await ssh.execCommand(writeCmd);
	if (result.code !== 0) {
		throw new Error(result.stderr || "Failed to write docker-compose.yml");
	}
}

export function buildComposeUpCommand(options?: {
	services?: string[];
	pull?: boolean;
	forceRecreate?: boolean;
}): string {
	const services = options?.services ?? [];
	if (services.length > 0) {
		assertValidComposeServiceNames(services);
	}

	const parts = ["cd ~/hermes"];

	if (options?.pull && services.length > 0) {
		parts.push(`sudo docker compose pull ${services.join(" ")}`);
	}

	const upCommand = ["sudo docker compose up", "-d"];
	if (options?.forceRecreate) {
		upCommand.push("--force-recreate");
	}
	if (services.length > 0) {
		upCommand.push("--no-deps", ...services);
	}
	parts.push(upCommand.join(" "));

	return parts.join(" && ");
}

export async function composeUp(
	ssh: NodeSSH,
	options?: {
		services?: string[];
		pull?: boolean;
		forceRecreate?: boolean;
	},
): Promise<void> {
	const command = buildComposeUpCommand(options);
	const result = await ssh.execCommand(command);
	if (result.code !== 0) {
		throw new Error(result.stderr || "docker compose up failed");
	}
}

export async function composePull(ssh: NodeSSH): Promise<void> {
	const result = await ssh.execCommand(
		"cd ~/hermes && sudo docker compose pull",
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || "docker compose pull failed");
	}
}

export async function composeUpAll(ssh: NodeSSH): Promise<void> {
	const result = await ssh.execCommand(
		"cd ~/hermes && sudo docker compose up -d",
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || "docker compose up failed");
	}
}
