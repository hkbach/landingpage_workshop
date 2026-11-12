-- BR-05: a booking keeps the price and the identity it was made with. The code, the shop, the quantity, the prices and the snapshot never change (a booking is moved to another session with
-- a new session_id, which is allowed; its price is not recalculated). The trigger is the last line of defence: the API never updates these columns.
CREATE FUNCTION "bookings_snapshot_immutable"() RETURNS trigger AS $$
BEGIN
	IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
		OR NEW."booking_code" IS DISTINCT FROM OLD."booking_code"
		OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
		OR NEW."unit_price_amount" IS DISTINCT FROM OLD."unit_price_amount"
		OR NEW."total_amount" IS DISTINCT FROM OLD."total_amount"
		OR NEW."discount_amount" IS DISTINCT FROM OLD."discount_amount"
		OR NEW."currency" IS DISTINCT FROM OLD."currency"
		OR NEW."customer_id" IS DISTINCT FROM OLD."customer_id"
		OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot" THEN
		RAISE EXCEPTION 'The code, the prices and the snapshot of a booking cannot be changed' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "bookings_snapshot_immutable" BEFORE UPDATE ON "bookings" FOR EACH ROW EXECUTE FUNCTION "bookings_snapshot_immutable"();
--> statement-breakpoint
-- REQUIREMENTS 8.5: payments only grow. Money that was taken in is never edited or deleted; a mistake is put right with a REVERSAL.
CREATE FUNCTION "payments_append_only"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'Payments are append only: record a reversal instead' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "payments_append_only" BEFORE UPDATE OR DELETE ON "payments" FOR EACH ROW EXECUTE FUNCTION "payments_append_only"();
--> statement-breakpoint
CREATE TRIGGER "payments_no_truncate" BEFORE TRUNCATE ON "payments" FOR EACH STATEMENT EXECUTE FUNCTION "payments_append_only"();
