CREATE TYPE "public"."booking_source" AS ENUM('ONLINE', 'WALK_IN', 'PHONE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('NOT_CONFIRMED', 'CONFIRMED', 'CHECKED_IN', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."cancelled_by" AS ENUM('SHOP', 'GUEST');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'CARD', 'BANK_TRANSFER', 'E_WALLET', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('UNPAID', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('PAYMENT', 'REVERSAL');--> statement-breakpoint
CREATE TABLE "booking_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_confirmations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "booking_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"booking_code" text NOT NULL,
	"session_id" uuid NOT NULL,
	"workshop_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"source" "booking_source" DEFAULT 'ONLINE' NOT NULL,
	"quantity" integer NOT NULL,
	"status" "booking_status" DEFAULT 'NOT_CONFIRMED' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'UNPAID' NOT NULL,
	"status_before_check_in" "booking_status",
	"unit_price_amount" bigint NOT NULL,
	"total_amount" bigint NOT NULL,
	"discount_amount" bigint DEFAULT 0 NOT NULL,
	"promotion_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"currency" text NOT NULL,
	"guest_name" text NOT NULL,
	"guest_email" text,
	"guest_phone" text DEFAULT '' NOT NULL,
	"guest_country" text DEFAULT '' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"special_request" text,
	"idempotency_key" text,
	"cancel_reason" text,
	"cancelled_by" "cancelled_by",
	"checked_in_at" timestamp with time zone,
	"checked_in_by" uuid,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_changed_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "bookings_org_code_unique" UNIQUE("organization_id","booking_code"),
	CONSTRAINT "bookings_org_idempotency_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "bookings_quantity" CHECK ("bookings"."quantity" BETWEEN 1 AND 50),
	CONSTRAINT "bookings_amounts" CHECK ("bookings"."unit_price_amount" >= 0 AND "bookings"."total_amount" >= 0 AND "bookings"."discount_amount" >= 0),
	CONSTRAINT "bookings_code_format" CHECK ("bookings"."booking_code" ~ '^SES-[0-9]{4,}-[0-9]{3,}$')
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email_normalized" text,
	"full_name" text NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"preferred_locale" text DEFAULT 'en' NOT NULL,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "customers_email_lowercase" CHECK ("customers"."email_normalized" IS NULL OR "customers"."email_normalized" = lower(btrim("customers"."email_normalized")))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"type" "payment_type" NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"method" "payment_method" NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "workshop_sessions" ADD COLUMN "booking_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_confirmations" ADD CONSTRAINT "booking_confirmations_booking_fk" FOREIGN KEY ("organization_id","booking_id") REFERENCES "public"."bookings"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_otps" ADD CONSTRAINT "booking_otps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_checked_in_by_users_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_status_changed_by_users_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."workshop_sessions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workshop_fk" FOREIGN KEY ("organization_id","workshop_id") REFERENCES "public"."workshops"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_fk" FOREIGN KEY ("organization_id","customer_id") REFERENCES "public"."customers"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_fk" FOREIGN KEY ("organization_id","booking_id") REFERENCES "public"."bookings"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_confirmations_booking_idx" ON "booking_confirmations" USING btree ("organization_id","booking_id");--> statement-breakpoint
CREATE INDEX "booking_otps_lookup_idx" ON "booking_otps" USING btree ("organization_id","email","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bookings_org_session_status_idx" ON "bookings" USING btree ("organization_id","session_id","status");--> statement-breakpoint
CREATE INDEX "bookings_org_created_idx" ON "bookings" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bookings_org_customer_idx" ON "bookings" USING btree ("organization_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_org_email_unique" ON "customers" USING btree ("organization_id","email_normalized") WHERE "customers"."email_normalized" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payments_org_booking_idx" ON "payments" USING btree ("organization_id","booking_id");--> statement-breakpoint
CREATE INDEX "payments_org_recorded_idx" ON "payments" USING btree ("organization_id","recorded_at" DESC NULLS LAST);