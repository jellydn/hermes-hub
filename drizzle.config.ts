import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL is required to load drizzle.config.ts");
}

export default defineConfig({
	out: "./drizzle",
	schema: "./server/db/schema.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL,
	},
});
