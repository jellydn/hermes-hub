import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getDb } from "./db";
import * as schema from "./db/schema";

const defaultBaseUrl = "http://localhost:3000";
const defaultSecret = "dev-only-better-auth-secret";

function createAuth() {
	return betterAuth({
		baseURL: process.env.BETTER_AUTH_URL ?? defaultBaseUrl,
		secret: process.env.BETTER_AUTH_SECRET ?? defaultSecret,
		database: drizzleAdapter(getDb(), {
			provider: "pg",
			schema,
		}),
		plugins: [
			tanstackStartCookies(),
			magicLink({
				sendMagicLink: async ({ email, url }) => {
					console.log(`Magic link for ${email}: ${url}`);
				},
			}),
		],
	});
}

let authInstance: ReturnType<typeof createAuth> | null = null;

export function hasDatabaseUrl() {
	return Boolean(process.env.DATABASE_URL);
}

export function getAuth() {
	if (!authInstance) {
		authInstance = createAuth();
	}

	return authInstance;
}

export async function getAuthSession(headers: Headers) {
	if (!hasDatabaseUrl()) {
		return null;
	}

	return getAuth().api.getSession({ headers });
}
