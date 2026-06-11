CREATE TABLE "agent_skills" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"source_type" text NOT NULL,
	"install_ref" text,
	"content" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_skills_user_id_idx" ON "agent_skills" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_skills_user_name_unique" ON "agent_skills" USING btree ("user_id","name");
