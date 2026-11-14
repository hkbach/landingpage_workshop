DROP INDEX "contact_messages_created_idx";--> statement-breakpoint
CREATE INDEX "organizations_created_idx" ON "organizations" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "workshops_created_idx" ON "workshops" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "affiliate_links_created_idx" ON "affiliate_links" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "workshop_ratings_created_idx" ON "workshop_ratings" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "contact_messages_created_idx" ON "contact_messages" USING btree ("created_at","id");