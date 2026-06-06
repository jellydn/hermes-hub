import { createRootRoute } from "@tanstack/react-router";

import { RootDocument } from "../components/root-document";

import themeInitScript from "../scripts/theme-init.js?raw";
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
					"Deploy Hermes Agent to your own VPS with guided install, live progress, and zero terminal setup.",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
		scripts: [
			{
				children: themeInitScript,
			},
		],
	}),
	shellComponent: RootDocument,
});
