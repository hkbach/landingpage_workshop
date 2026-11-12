CREATE TABLE "site_page_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"template_key" text NOT NULL,
	"content" jsonb NOT NULL,
	"theme" jsonb NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_page_versions_page_version_unique" UNIQUE("page_id","version")
);
--> statement-breakpoint
CREATE TABLE "site_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"template_key" text DEFAULT 'classic' NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft_content" jsonb,
	"published_content" jsonb,
	"published_theme" jsonb,
	"published_template_key" text,
	"version" integer DEFAULT 0 NOT NULL,
	"is_live" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_pages_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "site_pages_name" CHECK (char_length(btrim("site_pages"."name")) BETWEEN 1 AND 60),
	CONSTRAINT "site_pages_live_needs_content" CHECK (NOT "site_pages"."is_live" OR "site_pages"."published_content" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "site_page_versions" ADD CONSTRAINT "site_page_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_page_versions" ADD CONSTRAINT "site_page_versions_page_fk" FOREIGN KEY ("organization_id","page_id") REFERENCES "public"."site_pages"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_one_live_per_org" ON "site_pages" USING btree ("organization_id") WHERE "site_pages"."is_live";--> statement-breakpoint
CREATE INDEX "site_pages_org_idx" ON "site_pages" USING btree ("organization_id","created_at");