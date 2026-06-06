DROP INDEX IF EXISTS "mcp_servers_user_name_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_servers_user_name_unique" ON "mcp_servers" USING btree ("user_id","name");
