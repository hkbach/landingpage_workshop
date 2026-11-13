CREATE TYPE "public"."legal_version_status" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint
CREATE TABLE "legal_consents" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"epoch" integer NOT NULL,
	"version" integer NOT NULL,
	"locale" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_consents_user_id_kind_epoch_pk" PRIMARY KEY("user_id","kind","epoch"),
	CONSTRAINT "legal_consents_kind" CHECK ("legal_consents"."kind" IN ('terms', 'privacy'))
);
--> statement-breakpoint
CREATE TABLE "legal_versions" (
	"kind" text NOT NULL,
	"locale" text NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"status" "legal_version_status" DEFAULT 'DRAFT' NOT NULL,
	"major" boolean DEFAULT false NOT NULL,
	"epoch" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	CONSTRAINT "legal_versions_kind_locale_version_pk" PRIMARY KEY("kind","locale","version"),
	CONSTRAINT "legal_versions_kind" CHECK ("legal_versions"."kind" IN ('terms', 'privacy')),
	CONSTRAINT "legal_versions_content" CHECK (char_length("legal_versions"."content") BETWEEN 1 AND 50000),
	CONSTRAINT "legal_versions_published" CHECK (("legal_versions"."status" = 'PUBLISHED') = ("legal_versions"."published_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_versions" ADD CONSTRAINT "legal_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_versions" ADD CONSTRAINT "legal_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_consents_user_idx" ON "legal_consents" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_versions_one_draft" ON "legal_versions" USING btree ("kind","locale") WHERE "legal_versions"."status" = 'DRAFT';