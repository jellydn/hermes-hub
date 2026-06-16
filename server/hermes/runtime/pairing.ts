import type { NodeSSH } from "node-ssh";

import { shellQuote } from "../../ssh";

// ── Telegram pairing ─────────────────────────────────────────────

export async function runPairingCommand(
	ssh: NodeSSH,
	pythonCode: string,
	env: Record<string, string> = {},
): Promise<unknown> {
	const envArgs = Object.entries(env)
		.map(([key, value]) => `-e ${shellQuote(`${key}=${value}`)}`)
		.join(" ");

	const repairOwnership = [
		"sudo docker exec hermes sh -lc",
		shellQuote(
			'chown -R hermes:hermes "$HERMES_HOME/platforms/pairing" 2>/dev/null || chown -R hermes:hermes /opt/data/platforms/pairing 2>/dev/null || true',
		),
	].join(" ");

	const pairingCommand = [
		"sudo docker exec --user hermes",
		envArgs,
		"hermes python -c",
		shellQuote(pythonCode),
	]
		.filter(Boolean)
		.join(" ");

	const command = `${repairOwnership} && ${pairingCommand}`;

	const result = await ssh.execCommand(command, {
		execOptions: { timeout: 30_000 },
	});
	if (result.code !== 0) {
		throw new Error(result.stderr || "Hermes pairing command failed.");
	}

	try {
		return JSON.parse(result.stdout.trim()) as unknown;
	} catch {
		throw new Error(`Invalid pairing response: ${result.stdout.slice(0, 200)}`);
	}
}
