import { createRootRoute } from "@tanstack/react-router";

import { RootDocument } from "../components/root-document";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "HermesHub",
			},
			{
				name: "description",
				content:
					"Deploy and manage a self-hosted Hermes AI Agent on any VPS without SSH, Docker, or Linux knowledge.",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});
