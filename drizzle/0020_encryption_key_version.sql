ALTER TABLE "ai_providers" ADD COLUMN "encryption_key_version" text DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_configs" ADD COLUMN "encryption_key_version" text DEFAULT 'v1' NOT NULL;
