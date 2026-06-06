import { createFileRoute } from "@tanstack/react-router";

import { AboutPage } from "@/features/about/about-page";

export const Route = createFileRoute("/about")({
	head: () => ({
		meta: [
			{
				title: "About HermesHub",
			},
		],
	}),
	component: AboutPage,
});
