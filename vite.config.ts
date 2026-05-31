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
		? [viteReact()]
		: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
	test: {
		environment: "jsdom",
	},
});

export default config;
