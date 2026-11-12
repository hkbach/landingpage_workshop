CREATE TYPE "public"."schedule_rule_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('OPEN', 'PAUSED', 'RUNNING', 'CLOSED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."workshop_status" AS ENUM('DRAFT', 'ACTIVE');--> statement-breakpoint
CREATE TABLE "schedule_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workshop_id" uuid NOT NULL,
	"weekdays" smallint[] NOT NULL,
	"start_times" text[] NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"capacity_override" integer,
	"status" "schedule_rule_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_rules_weekdays" CHECK (cardinality("schedule_rules"."weekdays") BETWEEN 1 AND 7 AND "schedule_rules"."weekdays" <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
	CONSTRAINT "schedule_rules_start_times" CHECK (cardinality("schedule_rules"."start_times") BETWEEN 1 AND 12),
	CONSTRAINT "schedule_rules_dates" CHECK ("schedule_rules"."effective_to" IS NULL OR "schedule_rules"."effective_to" >= "schedule_rules"."effective_from"),
	CONSTRAINT "schedule_rules_capacity" CHECK ("schedule_rules"."capacity_override" IS NULL OR "schedule_rules"."capacity_override" BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE "workshop_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workshop_id" uuid NOT NULL,
	"schedule_rule_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"reserved_count" integer DEFAULT 0 NOT NULL,
	"status" "session_status" DEFAULT 'OPEN' NOT NULL,
	"auto_closed" boolean DEFAULT false NOT NULL,
	"code" text NOT NULL,
	"image_url" text,
	"cloned_from_session_id" uuid,
	"session_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"booking_cutoff_minutes" integer DEFAULT 120 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_sessions_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "workshop_sessions_org_code_unique" UNIQUE("organization_id","code"),
	CONSTRAINT "workshop_sessions_start_unique" UNIQUE("organization_id","workshop_id","starts_at"),
	CONSTRAINT "workshop_sessions_capacity" CHECK ("workshop_sessions"."capacity" BETWEEN 1 AND 50),
	CONSTRAINT "workshop_sessions_reserved" CHECK ("workshop_sessions"."reserved_count" BETWEEN 0 AND "workshop_sessions"."capacity"),
	CONSTRAINT "workshop_sessions_time" CHECK ("workshop_sessions"."ends_at" > "workshop_sessions"."starts_at"),
	CONSTRAINT "workshop_sessions_cutoff" CHECK ("workshop_sessions"."booking_cutoff_minutes" BETWEEN 0 AND 10080),
	CONSTRAINT "workshop_sessions_code_format" CHECK ("workshop_sessions"."code" ~ '^SES-[0-9]{4,}$')
);
--> statement-breakpoint
CREATE TABLE "workshops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" jsonb NOT NULL,
	"short_description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"includes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_minutes" integer NOT NULL,
	"price_amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"default_capacity" integer NOT NULL,
	"max_per_booking" integer DEFAULT 6 NOT NULL,
	"cover_url" text DEFAULT '' NOT NULL,
	"gallery_urls" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"categories" text[] NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"address_note" text DEFAULT '' NOT NULL,
	"status" "workshop_status" DEFAULT 'DRAFT' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshops_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "workshops_duration" CHECK ("workshops"."duration_minutes" BETWEEN 15 AND 600),
	CONSTRAINT "workshops_price" CHECK ("workshops"."price_amount" >= 0),
	CONSTRAINT "workshops_capacity" CHECK ("workshops"."default_capacity" BETWEEN 1 AND 50),
	CONSTRAINT "workshops_max_per_booking" CHECK ("workshops"."max_per_booking" BETWEEN 1 AND "workshops"."default_capacity"),
	CONSTRAINT "workshops_categories" CHECK (cardinality("workshops"."categories") BETWEEN 1 AND 3),
	CONSTRAINT "workshops_gallery" CHECK (cardinality("workshops"."gallery_urls") <= 6)
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "session_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_workshop_fk" FOREIGN KEY ("organization_id","workshop_id") REFERENCES "public"."workshops"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_sessions" ADD CONSTRAINT "workshop_sessions_workshop_fk" FOREIGN KEY ("organization_id","workshop_id") REFERENCES "public"."workshops"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_sessions" ADD CONSTRAINT "workshop_sessions_rule_fk" FOREIGN KEY ("schedule_rule_id") REFERENCES "public"."schedule_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_rules_workshop_idx" ON "schedule_rules" USING btree ("organization_id","workshop_id");--> statement-breakpoint
CREATE INDEX "workshop_sessions_org_start_idx" ON "workshop_sessions" USING btree ("organization_id","starts_at","status");--> statement-breakpoint
CREATE INDEX "workshop_sessions_open_end_idx" ON "workshop_sessions" USING btree ("ends_at") WHERE "workshop_sessions"."status" NOT IN ('CLOSED','COMPLETED');--> statement-breakpoint
CREATE INDEX "workshops_org_idx" ON "workshops" USING btree ("organization_id","sort_order","id");