import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getAuthSession } from "../../server/auth";

export const getCurrentSession = createServerFn({ method: "GET" }).handler(
	async () => {
		return getAuthSession(getRequestHeaders());
	},
);

export async function requireSession(locationHref?: string) {
	const session = await getCurrentSession();

	if (!session) {
		throw redirect({
			to: "/login",
			search: locationHref ? { redirect: locationHref } : undefined,
		});
	}

	return session;
}
