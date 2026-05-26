import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is required");
	}

	if (!database) {
		const client = postgres(process.env.DATABASE_URL, {
			max: 1,
			prepare: false,
		});

		database = drizzle(client, { schema });
	}

	return database;
}
