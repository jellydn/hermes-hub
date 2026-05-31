import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const isTest = process.env.VITEST === "true";

const config = defineConfig({
	optimizeDeps: {
		exclude: ["node-ssh", "ssh2", "cpu-features"],
	},
	resolve: { tsconfigPaths: true },
	plugins: isTest
		? []
		: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
	test: {
		environment: "node",
		cache: {
			dir: "node_modules/.vitest-cache",
		},
		include: [
			"src/**/*.{test,spec}.{js,ts,jsx,tsx}",
			"server/**/*.{test,spec}.{js,ts,jsx,tsx}",
		],
	},
});

export default config;
