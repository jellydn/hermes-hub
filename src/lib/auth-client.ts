import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const authBaseUrl =
	typeof window === "undefined"
		? `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/auth`
		: new URL("/api/auth", window.location.origin).toString();

export const authClient = createAuthClient({
	baseURL: authBaseUrl,
	plugins: [magicLinkClient()],
});
