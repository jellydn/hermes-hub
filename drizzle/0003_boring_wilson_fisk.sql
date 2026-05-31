ALTER TABLE "ai_providers" ADD COLUMN "base_url" text;--> statement-breakpoint
ALTER TABLE "telegram_configs" ADD COLUMN "deployed_server_id" text;--> statement-breakpoint
ALTER TABLE "telegram_configs" ADD COLUMN "deployed_server_host" text;--> statement-breakpoint
ALTER TABLE "telegram_configs" ADD COLUMN "api_server_key" text;