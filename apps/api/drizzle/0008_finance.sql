CREATE TABLE "finance_month_closings" (
	"organization_id" uuid NOT NULL,
	"month" text NOT NULL,
	"currency" text NOT NULL,
	"maintenance_bps" integer NOT NULL,
	"service_bps" integer NOT NULL,
	"totals" jsonb NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_month_closings_organization_id_month_pk" PRIMARY KEY("organization_id","month"),
	CONSTRAINT "month_closing_format" CHECK ("finance_month_closings"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "organization_fee_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"maintenance_bps" integer NOT NULL,
	"service_bps" integer NOT NULL,
	"affiliate_bps" integer NOT NULL,
	"invite_bonus_bps" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "fee_settings_range" CHECK ("organization_fee_settings"."maintenance_bps" BETWEEN 0 AND 10000 AND "organization_fee_settings"."service_bps" BETWEEN 0 AND 10000 AND "organization_fee_settings"."affiliate_bps" BETWEEN 0 AND 10000 AND "organization_fee_settings"."invite_bonus_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "fee_settings_total" CHECK ("organization_fee_settings"."maintenance_bps" + "organization_fee_settings"."service_bps" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "finance_month_closings" ADD CONSTRAINT "finance_month_closings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_fee_settings" ADD CONSTRAINT "organization_fee_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_fee_settings" ADD CONSTRAINT "organization_fee_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;