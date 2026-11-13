CREATE TYPE "public"."message_status" AS ENUM('NEW', 'IN_PROGRESS', 'DONE');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('OPEN', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"topic" text NOT NULL,
	"message" text NOT NULL,
	"status" "message_status" DEFAULT 'NEW' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_messages_topic" CHECK ("contact_messages"."topic" IN ('general', 'demo', 'support', 'partnership')),
	CONSTRAINT "contact_messages_sizes" CHECK (char_length("contact_messages"."name") <= 120 AND char_length("contact_messages"."message") <= 2000 AND char_length("contact_messages"."note") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"kind" text NOT NULL,
	"locale" text NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "legal_documents_kind_locale_pk" PRIMARY KEY("kind","locale"),
	CONSTRAINT "legal_documents_kind" CHECK ("legal_documents"."kind" IN ('terms', 'privacy')),
	CONSTRAINT "legal_documents_content" CHECK (char_length("legal_documents"."content") BETWEEN 1 AND 50000)
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "site_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"description" text NOT NULL,
	"reporter_email" text,
	"status" "report_status" DEFAULT 'OPEN' NOT NULL,
	"note" text,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_reports_reason" CHECK ("site_reports"."reason" IN ('SCAM', 'PHISHING', 'INAPPROPRIATE', 'OTHER')),
	CONSTRAINT "site_reports_sizes" CHECK (char_length("site_reports"."description") <= 2000 AND ("site_reports"."note" IS NULL OR char_length("site_reports"."note") <= 500)),
	CONSTRAINT "site_reports_handled" CHECK (("site_reports"."status" = 'OPEN') = ("site_reports"."handled_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_reports" ADD CONSTRAINT "site_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_reports" ADD CONSTRAINT "site_reports_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_messages_created_idx" ON "contact_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "site_reports_status_idx" ON "site_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "site_reports_org_idx" ON "site_reports" USING btree ("organization_id","created_at");