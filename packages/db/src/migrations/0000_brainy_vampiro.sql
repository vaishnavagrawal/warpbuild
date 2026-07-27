CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"datasource_id" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datasource" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'postgres' NOT NULL,
	"connection_string" text NOT NULL,
	"ssl_mode" text DEFAULT 'prefer' NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"last_checked_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"datasource_id" text NOT NULL,
	"version" integer NOT NULL,
	"checksum" text NOT NULL,
	"definition" jsonb NOT NULL,
	"rendered_text" text NOT NULL,
	"table_count" integer NOT NULL,
	"token_estimate" integer NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "schema_snapshot_datasourceId_version_key" UNIQUE("datasource_id","version")
);
--> statement-breakpoint
CREATE TABLE "query_log" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text,
	"datasource_id" text NOT NULL,
	"message_id" text,
	"sql" text NOT NULL,
	"status" text NOT NULL,
	"rejection_reason" text,
	"row_count" integer,
	"truncated" boolean DEFAULT false NOT NULL,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_datasource_id_datasource_id_fk" FOREIGN KEY ("datasource_id") REFERENCES "public"."datasource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_snapshot_id_schema_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."schema_snapshot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_snapshot" ADD CONSTRAINT "schema_snapshot_datasource_id_datasource_id_fk" FOREIGN KEY ("datasource_id") REFERENCES "public"."datasource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_log" ADD CONSTRAINT "query_log_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_log" ADD CONSTRAINT "query_log_datasource_id_datasource_id_fk" FOREIGN KEY ("datasource_id") REFERENCES "public"."datasource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "chat_datasourceId_idx" ON "chat" USING btree ("datasource_id");--> statement-breakpoint
CREATE INDEX "schema_snapshot_datasourceId_idx" ON "schema_snapshot" USING btree ("datasource_id");--> statement-breakpoint
CREATE INDEX "query_log_chatId_idx" ON "query_log" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "query_log_createdAt_idx" ON "query_log" USING btree ("created_at");