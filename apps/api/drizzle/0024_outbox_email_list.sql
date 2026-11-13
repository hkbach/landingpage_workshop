ALTER TABLE "outbox_events" ADD COLUMN "recipient" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "template" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "subject" text;