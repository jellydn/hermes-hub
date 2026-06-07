CREATE TABLE "ai_user_subscriptions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"subscription_provider" text NOT NULL,
	"model" text NOT NULL,
	"auth_mode" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_user_subscriptions" ADD CONSTRAINT "ai_user_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ai_user_subscriptions_user_id_idx" ON "ai_user_subscriptions" USING btree ("user_id");
--> statement-breakpoint
INSERT INTO "ai_user_subscriptions" (
	"user_id",
	"subscription_provider",
	"model",
	"auth_mode",
	"is_active",
	"created_at",
	"updated_at"
)
SELECT
	"user_id",
	'chatgpt',
	"model",
	'chatgpt',
	"is_active",
	"created_at",
	"created_at"
FROM "ai_providers"
WHERE "provider" = 'openai-codex' AND "is_active" = true;
--> statement-breakpoint
UPDATE "ai_providers"
SET "is_active" = false
WHERE "provider" = 'openai-codex' AND "is_active" = true;
