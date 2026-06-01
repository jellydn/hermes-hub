ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "base_url" text;--> statement-breakpoint
ALTER TABLE "telegram_configs" ADD COLUMN IF NOT EXISTS "deployed_server_id" text;--> statement-breakpoint
ALTER TABLE "telegram_configs" ADD COLUMN IF NOT EXISTS "deployed_server_host" text;--> statement-breakpoint
ALTER TABLE "telegram_configs" ADD COLUMN IF NOT EXISTS "api_server_key" text;
