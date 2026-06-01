ALTER TABLE "audit_logs" ADD COLUMN "server_id" text;--> statement-breakpoint
CREATE INDEX "audit_logs_server_id_idx" ON "audit_logs" USING btree ("user_id","server_id","created_at" DESC NULLS LAST);