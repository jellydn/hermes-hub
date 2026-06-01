import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
	const isTest = process.env.VITEST === "true";

	const plugins = isTest
		? []
		: [
				(await import("@tanstack/devtools-vite")).devtools(),
				(await import("@tailwindcss/vite")).default(),
				(await import("@tanstack/react-start/plugin/vite")).tanstackStart(),
				(await import("@vitejs/plugin-react")).default(),
			];

	return {
		optimizeDeps: {
			exclude: ["node-ssh", "ssh2", "cpu-features"],
		},
		resolve: { tsconfigPaths: true },
		plugins,
		test: {
			environment: "node",
			include: [
				"src/**/*.{test,spec}.{js,ts,jsx,tsx}",
				"server/**/*.{test,spec}.{js,ts,jsx,tsx}",
			],
		},
	};
});
