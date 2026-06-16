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
