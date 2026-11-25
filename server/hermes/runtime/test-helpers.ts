import { vi } from "vitest";

/**
 * Shared mock for SSH execCommand used across all runtime test files.
 *
 * Returns a vitest mock that passes commands through `execImpl` when
 * provided, otherwise returns a successful empty-result default.
 */
export function mockSsh(
	execImpl?: (
		cmd: string,
		opts?: unknown,
	) => { code: number; stdout: string; stderr: string },
) {
	const execCommand = vi.fn(async (cmd: string, opts?: unknown) => {
		if (execImpl) {
			return execImpl(cmd, opts);
		}
		return { code: 0, stdout: "", stderr: "" };
	});
	return { execCommand };
}

/**
 * A fake Docker host for image-swap tests. It tracks the compose `image:`
 * and the image the hermes container was created from, and answers the
 * commands runtime.ts sends. `onSwap` decides what the swap command does:
 * `recreate` (compose and container move to the pulled image), `keep`
 * (compose moves, the container stays: the drift bug), or `fail`.
 */
export function mockDockerHost(state: {
	composeImage: string | null;
	containerImage: string | null;
	repoDigests?: string[];
	onSwap?: "recreate" | "keep" | "fail";
	swapStdout?: string;
}) {
	return mockSsh((cmd) => {
		if (cmd.startsWith("sed -n")) {
			return { code: 0, stdout: `${state.composeImage ?? ""}\n`, stderr: "" };
		}
		if (cmd.startsWith("sudo docker inspect --format '{{.Config.Image}}'")) {
			if (!state.containerImage) {
				return { code: 1, stdout: "", stderr: "No such object: hermes" };
			}
			const digests = cmd.includes("docker image inspect")
				? (state.repoDigests ?? []).map((line) => `\n${line}`).join("")
				: "";
			return {
				code: 0,
				stdout: `${state.containerImage}${digests}\n`,
				stderr: "",
			};
		}
		const pulled = cmd.match(/sudo docker pull (\S+)/)?.[1];
		if (pulled) {
			if (state.onSwap === "fail") {
				return { code: 1, stdout: "", stderr: "Pull failed" };
			}
			state.composeImage = pulled;
			if (state.onSwap !== "keep") {
				state.containerImage = pulled;
				state.repoDigests = [];
			}
			return { code: 0, stdout: state.swapStdout ?? "ok\n", stderr: "" };
		}
		return { code: 0, stdout: "", stderr: "" };
	});
}
