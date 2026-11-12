CREATE TYPE "public"."wallet_source" AS ENUM('AFFILIATE', 'REFERRAL');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_status" AS ENUM('PENDING', 'PAID', 'REJECTED');--> statement-breakpoint
CREATE TABLE "wallet_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "wallet_source" NOT NULL,
	"currency" text NOT NULL,
	"amount" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_credits_amount" CHECK ("wallet_credits"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "withdrawal_limits" (
	"currency" text PRIMARY KEY NOT NULL,
	"min_amount" bigint DEFAULT 0 NOT NULL,
	"max_amount" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "withdrawal_limits_range" CHECK ("withdrawal_limits"."min_amount" >= 0 AND "withdrawal_limits"."max_amount" >= 0 AND ("withdrawal_limits"."max_amount" = 0 OR "withdrawal_limits"."max_amount" >= "withdrawal_limits"."min_amount")),
	CONSTRAINT "withdrawal_limits_currency" CHECK ("withdrawal_limits"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "wallet_source" NOT NULL,
	"currency" text NOT NULL,
	"amount" bigint NOT NULL,
	"status" "withdrawal_status" DEFAULT 'PENDING' NOT NULL,
	"reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processed_by" uuid,
	CONSTRAINT "withdrawals_number_unique" UNIQUE("number"),
	CONSTRAINT "withdrawals_amount" CHECK ("withdrawals"."amount" > 0),
	CONSTRAINT "withdrawals_processed" CHECK (("withdrawals"."status" = 'PENDING') = ("withdrawals"."processed_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "wallet_credits" ADD CONSTRAINT "wallet_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_limits" ADD CONSTRAINT "withdrawal_limits_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_credits_user_idx" ON "wallet_credits" USING btree ("user_id","source","currency");--> statement-breakpoint
CREATE INDEX "withdrawals_user_idx" ON "withdrawals" USING btree ("user_id","source","currency");--> statement-breakpoint
CREATE INDEX "withdrawals_status_idx" ON "withdrawals" USING btree ("status","requested_at");