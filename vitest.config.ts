import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["packages/**/src/**/*.test.ts"],
		coverage: {
			enabled: false,
			provider: "v8",
			reporter: ["lcov", "html", "text-summary"],
			include: ["packages/**/src/**/*.ts"],
			exclude: ["packages/**/src/**/*.test.ts"],
		},
	},
});
