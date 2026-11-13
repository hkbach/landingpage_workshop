CREATE TABLE "affiliate_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"workshop_id" uuid NOT NULL,
	"code" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"disabled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_links_code_unique" UNIQUE("code"),
	CONSTRAINT "affiliate_links_user_workshop_unique" UNIQUE("user_id","workshop_id"),
	CONSTRAINT "affiliate_links_code" CHECK ("affiliate_links"."code" ~ '^A[A-Z0-9]{8}$'),
	CONSTRAINT "affiliate_links_clicks" CHECK ("affiliate_links"."clicks" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invite_links" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"disabled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_links_code_unique" UNIQUE("code"),
	CONSTRAINT "invite_links_code" CHECK ("invite_links"."code" ~ '^I[A-Z0-9]{8}$')
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inviter_user_id" uuid NOT NULL,
	"friend_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_friend_user_id_unique" UNIQUE("friend_user_id"),
	CONSTRAINT "referrals_not_self" CHECK ("referrals"."inviter_user_id" <> "referrals"."friend_user_id")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "affiliate_link_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_month_closings" ADD COLUMN "affiliate_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_month_closings" ADD COLUMN "invite_bonus_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_workshop_fk" FOREIGN KEY ("organization_id","workshop_id") REFERENCES "public"."workshops"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_friend_user_id_users_id_fk" FOREIGN KEY ("friend_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_links_user_idx" ON "affiliate_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "affiliate_links_workshop_idx" ON "affiliate_links" USING btree ("organization_id","workshop_id");--> statement-breakpoint
CREATE INDEX "referrals_inviter_idx" ON "referrals" USING btree ("inviter_user_id","created_at");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_affiliate_link_id_affiliate_links_id_fk" FOREIGN KEY ("affiliate_link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE no action ON UPDATE no action;