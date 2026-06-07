import { createFileRoute, redirect } from "@tanstack/react-router";

import { LoginPage } from "#/features/auth/login-page";
import { getCurrentSession } from "#/lib/session";

type LoginSearch = {
	redirect?: string;
};

export const Route = createFileRoute("/login")({
	validateSearch: (search: Record<string, unknown>): LoginSearch => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	beforeLoad: async () => {
		const session = await getCurrentSession();

		if (session) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: LoginPage,
});
