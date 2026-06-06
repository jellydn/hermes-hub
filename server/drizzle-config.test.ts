import { describe, expect, it } from "vitest";

describe("drizzle.config.ts", () => {
	it("imports without DATABASE_URL", async () => {
		const previous = process.env.DATABASE_URL;
		delete process.env.DATABASE_URL;

		try {
			const config = await import("../drizzle.config.ts");
			expect(config.default).toBeDefined();
			expect(
				(
					config.default as unknown as {
						dbCredentials: { url: string };
					}
				).dbCredentials.url,
			).toBe("");
		} finally {
			if (previous !== undefined) {
				process.env.DATABASE_URL = previous;
			}
		}
	});
});
