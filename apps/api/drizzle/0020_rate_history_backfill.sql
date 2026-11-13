-- D24: the rates a shop has now become the first row of its history, in force from the moment they were last saved (that is all that is known of the past: before it, the defaults applied).
INSERT INTO "organization_fee_rates" ("organization_id", "effective_from", "maintenance_bps", "service_bps", "affiliate_bps", "invite_bonus_bps", "created_by")
SELECT "organization_id", "updated_at", "maintenance_bps", "service_bps", "affiliate_bps", "invite_bonus_bps", "updated_by" FROM "organization_fee_settings";
--> statement-breakpoint
-- The history only grows: a rate that was in force is never edited or deleted, so every fee worked out with it can be worked out again.
CREATE FUNCTION "fee_rates_append_only"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'The history of the fee rates is append only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "fee_rates_append_only" BEFORE UPDATE OR DELETE ON "organization_fee_rates" FOR EACH ROW EXECUTE FUNCTION "fee_rates_append_only"();
--> statement-breakpoint
CREATE TRIGGER "fee_rates_no_truncate" BEFORE TRUNCATE ON "organization_fee_rates" FOR EACH STATEMENT EXECUTE FUNCTION "fee_rates_append_only"();
