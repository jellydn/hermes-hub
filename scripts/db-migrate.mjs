import { execSync } from "node:child_process";
import { join } from "node:path";

if (!process.env.DATABASE_URL) {
	console.error("DATABASE_URL is required to run database migrations.");
	process.exit(1);
}

execSync("node ./node_modules/.bin/drizzle-kit migrate", {
	cwd: join(import.meta.dirname, ".."),
	stdio: "inherit",
	env: process.env,
});
