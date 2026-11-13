-- BR-05 again: the affiliate link a booking came through is set when the booking is made and never changes.
CREATE OR REPLACE FUNCTION "bookings_snapshot_immutable"() RETURNS trigger AS $$
BEGIN
	IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
		OR NEW."booking_code" IS DISTINCT FROM OLD."booking_code"
		OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
		OR NEW."unit_price_amount" IS DISTINCT FROM OLD."unit_price_amount"
		OR NEW."total_amount" IS DISTINCT FROM OLD."total_amount"
		OR NEW."discount_amount" IS DISTINCT FROM OLD."discount_amount"
		OR NEW."currency" IS DISTINCT FROM OLD."currency"
		OR NEW."customer_id" IS DISTINCT FROM OLD."customer_id"
		OR NEW."affiliate_link_id" IS DISTINCT FROM OLD."affiliate_link_id"
		OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot" THEN
		RAISE EXCEPTION 'The code, the prices, the affiliate link and the snapshot of a booking cannot be changed' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- A link keeps its code, its owner and its workshop for good (the code is in the addresses people shared).
CREATE FUNCTION "links_identity_immutable"() RETURNS trigger AS $$
BEGIN
	IF NEW."code" IS DISTINCT FROM OLD."code" OR NEW."user_id" IS DISTINCT FROM OLD."user_id" THEN
		RAISE EXCEPTION 'The code and the owner of a link cannot be changed' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_TABLE_NAME = 'affiliate_links' AND (NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR NEW."workshop_id" IS DISTINCT FROM OLD."workshop_id") THEN
		RAISE EXCEPTION 'The workshop of a link cannot be changed' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "affiliate_links_identity_immutable" BEFORE UPDATE ON "affiliate_links" FOR EACH ROW EXECUTE FUNCTION "links_identity_immutable"();
--> statement-breakpoint
CREATE TRIGGER "invite_links_identity_immutable" BEFORE UPDATE ON "invite_links" FOR EACH ROW EXECUTE FUNCTION "links_identity_immutable"();
--> statement-breakpoint
-- A friend who registered with an invite stays that inviter's friend: the rows only grow.
CREATE FUNCTION "referrals_append_only"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'Referrals are append only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "referrals_append_only" BEFORE UPDATE OR DELETE ON "referrals" FOR EACH ROW EXECUTE FUNCTION "referrals_append_only"();
