import { createFileRoute, redirect } from "@tanstack/react-router";

import { LandingPage } from "@/features/landing/landing-page";
import { getCurrentSession } from "@/lib/session";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		const session = await getCurrentSession();

		if (session) {
			throw redirect({ to: "/dashboard" });
		}
	},
	head: () => ({
		meta: [
			{
				title: "HermesHub — Deploy Hermes Agent without the terminal",
			},
			{
				name: "description",
				content:
					"Deploy and manage a self-hosted Hermes AI Agent on any VPS without SSH, Docker, or Linux knowledge. Your personal AI agent in 5 minutes.",
			},
		],
	}),
	component: LandingPage,
});
