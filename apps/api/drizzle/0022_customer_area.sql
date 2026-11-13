CREATE TABLE "customer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"birth_date" date,
	"favorite_categories" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"gender" text,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"avatar_url" text,
	"consent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_profiles_gender" CHECK ("customer_profiles"."gender" IS NULL OR "customer_profiles"."gender" IN ('MALE', 'FEMALE', 'OTHER'))
);
--> statement-breakpoint
CREATE TABLE "favorite_workshops" (
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"workshop_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_workshops_user_id_workshop_id_pk" PRIMARY KEY("user_id","workshop_id")
);
--> statement-breakpoint
CREATE TABLE "workshop_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workshop_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"stars" integer NOT NULL,
	"comment" text,
	"removed_at" timestamp with time zone,
	"removed_reason" text,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_ratings_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "workshop_ratings_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "workshop_ratings_stars" CHECK ("workshop_ratings"."stars" BETWEEN 1 AND 5),
	CONSTRAINT "workshop_ratings_comment" CHECK ("workshop_ratings"."comment" IS NULL OR char_length("workshop_ratings"."comment") <= 500)
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "show_on_customer_page" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_workshops" ADD CONSTRAINT "favorite_workshops_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_workshops" ADD CONSTRAINT "favorite_workshops_workshop_fk" FOREIGN KEY ("organization_id","workshop_id") REFERENCES "public"."workshops"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_ratings" ADD CONSTRAINT "workshop_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_ratings" ADD CONSTRAINT "workshop_ratings_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_ratings" ADD CONSTRAINT "workshop_ratings_workshop_fk" FOREIGN KEY ("organization_id","workshop_id") REFERENCES "public"."workshops"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorite_workshops_user_idx" ON "favorite_workshops" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "workshop_ratings_workshop_idx" ON "workshop_ratings" USING btree ("organization_id","workshop_id","created_at");