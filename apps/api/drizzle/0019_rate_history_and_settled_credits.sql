CREATE TABLE "organization_fee_rates" (
	"organization_id" uuid NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"maintenance_bps" integer NOT NULL,
	"service_bps" integer NOT NULL,
	"affiliate_bps" integer NOT NULL,
	"invite_bonus_bps" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_fee_rates_organization_id_effective_from_pk" PRIMARY KEY("organization_id","effective_from"),
	CONSTRAINT "fee_rates_range" CHECK ("organization_fee_rates"."maintenance_bps" BETWEEN 0 AND 10000 AND "organization_fee_rates"."service_bps" BETWEEN 0 AND 10000 AND "organization_fee_rates"."affiliate_bps" BETWEEN 0 AND 10000 AND "organization_fee_rates"."invite_bonus_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "fee_rates_total" CHECK ("organization_fee_rates"."maintenance_bps" + "organization_fee_rates"."service_bps" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "wallet_credits" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "wallet_credits" ADD COLUMN "month" text;--> statement-breakpoint
ALTER TABLE "organization_fee_rates" ADD CONSTRAINT "organization_fee_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_fee_rates" ADD CONSTRAINT "organization_fee_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_credits" ADD CONSTRAINT "wallet_credits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_credits_settled_unique" ON "wallet_credits" USING btree ("user_id","source","currency","organization_id","month") WHERE "wallet_credits"."month" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_credits" ADD CONSTRAINT "wallet_credits_month" CHECK (("wallet_credits"."month" IS NULL) = ("wallet_credits"."organization_id" IS NULL));