CREATE UNIQUE INDEX IF NOT EXISTS "ai_providers_active_user_id_idx" ON "ai_providers" USING btree ("user_id") WHERE "is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_user_subscriptions_active_user_id_idx" ON "ai_user_subscriptions" USING btree ("user_id") WHERE "is_active" = true;
