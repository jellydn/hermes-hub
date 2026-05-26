import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const healthChecks = pgTable("health_checks", {
	id: text("id").primaryKey(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});
