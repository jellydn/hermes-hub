CREATE TABLE "mcp_servers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"transport" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"command" text,
	"args" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"url" text,
	"encrypted_env" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"encrypted_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tools_include" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tools_exclude" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tools_resources" boolean DEFAULT true NOT NULL,
	"tools_prompts" boolean DEFAULT true NOT NULL,
	"timeout" integer,
	"connect_timeout" integer,
	"supports_parallel_tool_calls" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_servers_user_id_idx" ON "mcp_servers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_servers_user_name_idx" ON "mcp_servers" USING btree ("user_id","name");
