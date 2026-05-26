import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { getDb } from "./db";
import * as schema from "./db/schema";

const defaultBaseUrl = "http://localhost:3000";
const defaultSecret = "dev-only-better-auth-secret";

export const auth = betterAuth({
	baseURL: process.env.BETTER_AUTH_URL ?? defaultBaseUrl,
	secret: process.env.BETTER_AUTH_SECRET ?? defaultSecret,
	database: drizzleAdapter(getDb(), {
		provider: "pg",
		schema,
	}),
	plugins: [
		magicLink({
			sendMagicLink: async ({ email, url }) => {
				console.log(`Magic link for ${email}: ${url}`);
			},
		}),
	],
});
