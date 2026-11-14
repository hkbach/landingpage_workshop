DROP INDEX "bookings_org_created_idx";--> statement-breakpoint
CREATE INDEX "workshop_sessions_starts_idx" ON "workshop_sessions" USING btree ("starts_at","id");--> statement-breakpoint
CREATE INDEX "bookings_org_created_id_idx" ON "bookings" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "bookings_guest_email_lower_idx" ON "bookings" USING btree (lower("guest_email"));--> statement-breakpoint
CREATE INDEX "bookings_affiliate_link_idx" ON "bookings" USING btree ("affiliate_link_id") WHERE "bookings"."affiliate_link_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bookings_org_workshop_idx" ON "bookings" USING btree ("organization_id","workshop_id");--> statement-breakpoint
CREATE INDEX "bookings_created_idx" ON "bookings" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "customers_org_created_idx" ON "customers" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email_normalized");--> statement-breakpoint
CREATE INDEX "outbox_events_email_created_idx" ON "outbox_events" USING btree ("created_at","id") WHERE "outbox_events"."type" = 'EMAIL';--> statement-breakpoint
CREATE INDEX "workshop_ratings_live_idx" ON "workshop_ratings" USING btree ("workshop_id") WHERE "workshop_ratings"."removed_at" IS NULL;