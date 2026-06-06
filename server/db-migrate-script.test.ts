import { execSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..");

describe("db:migrate", () => {
	it("fails with a clear error when DATABASE_URL is unset", () => {
		try {
			execSync("env -u DATABASE_URL bun run db:migrate", {
				cwd: repoRoot,
				stdio: "pipe",
				encoding: "utf8",
			});
			expect.fail("db:migrate should fail without DATABASE_URL");
		} catch (error) {
			const output =
				typeof error === "object" &&
				error !== null &&
				"stderr" in error &&
				typeof error.stderr === "string"
					? error.stderr
					: String(error);
			expect(output).toContain("DATABASE_URL is required");
		}
	});
});
