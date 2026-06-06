CREATE INDEX "audit_logs_user_created_idx" ON "audit_logs" USING btree ("user_id","created_at" DESC NULLS LAST);
