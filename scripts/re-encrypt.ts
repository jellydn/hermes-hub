import { getActiveEncryptionKeyVersion } from "../server/crypto";
import { getDb } from "../server/db";
import {
	applyReencryption,
	planReencryption,
} from "../server/lib/re-encryption-runner";

const args = process.argv.slice(2);
const apply = args.includes("--apply");

if (!process.env.DATABASE_URL) {
	console.error("DATABASE_URL is required to run the re-encryption runner.");
	process.exit(1);
}

if (!process.env.ENCRYPTION_KEY) {
	console.error("ENCRYPTION_KEY is required to run the re-encryption runner.");
	process.exit(1);
}

if (!process.env.ENCRYPTION_KEY_V2) {
	console.log("active version is v1 — nothing to re-encrypt");
	process.exit(0);
}

const db = getDb();

if (!apply) {
	const plan = await planReencryption(db);
	for (const error of plan.errors) {
		console.error(
			`${error.table}:${error.id}:${error.column} — ${error.reason}`,
		);
	}
	const counts = Object.entries(plan.perTableCounts)
		.map(([table, count]) => `${table}: ${count}`)
		.join(", ");
	console.log(
		`active version ${plan.activeVersion}: ${plan.staleCount} row(s) to re-encrypt (${counts})`,
	);
	if (plan.errors.length > 0) {
		console.error(
			`${plan.errors.length} row(s) could not be decrypted — run with --apply after fixing them`,
		);
		process.exit(1);
	}
	process.exit(0);
}

const result = await applyReencryption(db);

if (!result.ok) {
	for (const error of result.errors) {
		console.error(
			`${error.table}:${error.id}:${error.column} — ${error.reason}`,
		);
	}
	console.error(
		`aborted: ${result.errors.length} row(s) could not be decrypted; no rows were rewritten`,
	);
	process.exit(1);
}

const counts = Object.entries(result.perTableCounts)
	.map(([table, count]) => `${table}: ${count}`)
	.join(", ");
console.log(
	`re-encrypted ${result.reencrypted} row(s) to ${getActiveEncryptionKeyVersion()} (${counts})`,
);
process.exit(0);
