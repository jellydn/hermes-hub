CREATE TABLE "install_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"install_id" text NOT NULL,
	"step" text NOT NULL,
	"progress" integer NOT NULL,
	"message" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "install_events" ADD CONSTRAINT "install_events_install_id_installs_id_fk" FOREIGN KEY ("install_id") REFERENCES "public"."installs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "install_events_install_id_created_at_idx" ON "install_events" USING btree ("install_id","created_at");
