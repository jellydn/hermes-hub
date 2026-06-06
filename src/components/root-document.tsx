import { TanStackDevtools } from "@tanstack/react-devtools";
import { HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import Footer from "./Footer";
import Header from "./Header";

const themeInitScript = `(() => {
	var stored = window.localStorage.getItem("theme");
	var mode =
		stored === "light" || stored === "dark" || stored === "auto"
			? stored
			: "auto";
	var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	var resolved = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;
	var root = document.documentElement;
	root.classList.remove("light", "dark");
	root.classList.add(resolved);
	if (mode === "auto") {
		root.removeAttribute("data-theme");
	} else {
		root.setAttribute("data-theme", mode);
	}
	root.style.colorScheme = resolved;
})();`;

export function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script
					suppressHydrationWarning
					// biome-ignore lint/security/noDangerouslySetInnerHtml: theme init script is static
					// react-doctor-disable-next-line react-doctor/no-danger
					dangerouslySetInnerHTML={{ __html: themeInitScript }}
				/>
				<HeadContent />
			</head>
			<body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]">
				<Header />
				{children}
				<Footer />
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
