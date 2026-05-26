import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getDb } from "./db";
import * as schema from "./db/schema";
import { sendMagicLinkEmail } from "./lib/send-magic-link-email";

function createAuth() {
	const baseURL = process.env.BETTER_AUTH_URL;
	const secret = process.env.BETTER_AUTH_SECRET;

	if (!baseURL || !secret) {
		if (process.env.NODE_ENV !== "development") {
			throw new Error(
				"BETTER_AUTH_URL and BETTER_AUTH_SECRET are required in production. " +
					"Set both environment variables before starting the server.",
			);
		}

		return betterAuth({
			baseURL: baseURL ?? "http://localhost:3000",
			secret: secret ?? "dev-only-better-auth-secret",
			database: drizzleAdapter(getDb(), {
				provider: "pg",
				schema,
			}),
			plugins: [
				tanstackStartCookies(),
				magicLink({
					sendMagicLink: async ({ email, url }) => {
						await sendMagicLinkEmail({ email, url });
					},
				}),
			],
		});
	}

	return betterAuth({
		baseURL,
		secret,
		database: drizzleAdapter(getDb(), {
			provider: "pg",
			schema,
		}),
		plugins: [
			tanstackStartCookies(),
			magicLink({
				sendMagicLink: async ({ email, url }) => {
					await sendMagicLinkEmail({ email, url });
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
