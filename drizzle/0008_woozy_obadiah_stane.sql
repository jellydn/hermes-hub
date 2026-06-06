ALTER TABLE "server_web_ui" ADD COLUMN "deploy_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "server_web_ui" ADD COLUMN "deploy_error" text;--> statement-breakpoint
UPDATE "server_web_ui" SET "deploy_status" = 'succeeded' WHERE "enabled" = true;
