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
				"shared/**/*.{test,spec}.{js,ts,jsx,tsx}",
			],
			coverage: {
				provider: "v8",
				reporter: ["text", "lcov", "html"],
				thresholds: {
					lines: 45,
					functions: 40,
					branches: 35,
					statements: 45,
				},
				include: ["src/**/*.ts", "src/**/*.tsx", "server/**/*.ts"],
				exclude: [
					"src/routeTree.gen.ts",
					"src/router.tsx",
					"src/server.ts",
					"**/*.test.ts",
					"**/*.test.tsx",
					"**/*.d.ts",
					"scripts/**",
				],
			},
		},
	} as Record<string, unknown>;
});
