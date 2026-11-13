CREATE TYPE "public"."discount_type" AS ENUM('PERCENT', 'FIXED_AMOUNT');--> statement-breakpoint
CREATE TYPE "public"."stacking_mode" AS ENUM('SINGLE', 'MULTIPLE');--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" jsonb NOT NULL,
	"description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"discount_type" "discount_type" NOT NULL,
	"discount_value" bigint NOT NULL,
	"code" text NOT NULL,
	"image_url" text,
	"stacking" "stacking_mode" DEFAULT 'SINGLE' NOT NULL,
	"applies_to" text DEFAULT 'ALL' NOT NULL,
	"workshop_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"held_reason" text,
	"held_at" timestamp with time zone,
	"held_by" uuid,
	"held_was_enabled" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_org_code_unique" UNIQUE("organization_id","code"),
	CONSTRAINT "promotions_code" CHECK ("promotions"."code" ~ '^[A-Z0-9]{3,20}$'),
	CONSTRAINT "promotions_value" CHECK ("promotions"."discount_value" > 0 AND ("promotions"."discount_type" <> 'PERCENT' OR "promotions"."discount_value" <= 100)),
	CONSTRAINT "promotions_applies_to" CHECK ("promotions"."applies_to" IN ('ALL', 'SELECTED') AND ("promotions"."applies_to" = 'ALL' OR cardinality("promotions"."workshop_ids") > 0)),
	CONSTRAINT "promotions_dates" CHECK ("promotions"."end_date" >= "promotions"."start_date")
);
--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_held_by_users_id_fk" FOREIGN KEY ("held_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promotions_org_idx" ON "promotions" USING btree ("organization_id","created_at");