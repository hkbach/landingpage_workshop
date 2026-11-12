-- The slot a session was made for. Added in three steps so it also works on a table that already has rows (each existing session was made for the time it has now).
ALTER TABLE "workshop_sessions" ADD COLUMN "origin_starts_at" timestamp with time zone;--> statement-breakpoint
UPDATE "workshop_sessions" SET "origin_starts_at" = "starts_at" WHERE "origin_starts_at" IS NULL;--> statement-breakpoint
ALTER TABLE "workshop_sessions" ALTER COLUMN "origin_starts_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workshop_sessions" ADD CONSTRAINT "workshop_sessions_origin_unique" UNIQUE("organization_id","workshop_id","origin_starts_at");
