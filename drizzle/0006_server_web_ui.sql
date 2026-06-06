CREATE TABLE "server_web_ui" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"server_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"encrypted_password" text,
	"port" integer DEFAULT 8787 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_web_ui_server_id_unique" UNIQUE("server_id")
);
--> statement-breakpoint
ALTER TABLE "server_web_ui" ADD CONSTRAINT "server_web_ui_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;
