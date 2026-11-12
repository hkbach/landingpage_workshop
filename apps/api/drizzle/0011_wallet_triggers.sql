-- Withdrawal numbers WD-0001...: a sequence, so two requests at the same time never get the same number (a number lost to a rolled back request is a gap, not a duplicate).
CREATE SEQUENCE "withdrawal_number_seq" START 1;
--> statement-breakpoint
-- The credits of a wallet only grow: what was earned is never edited or deleted.
CREATE FUNCTION "wallet_credits_append_only"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'Wallet credits are append only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "wallet_credits_append_only" BEFORE UPDATE OR DELETE ON "wallet_credits" FOR EACH ROW EXECUTE FUNCTION "wallet_credits_append_only"();
--> statement-breakpoint
CREATE TRIGGER "wallet_credits_no_truncate" BEFORE TRUNCATE ON "wallet_credits" FOR EACH STATEMENT EXECUTE FUNCTION "wallet_credits_append_only"();
--> statement-breakpoint
-- An invoice is processed once: the customer, the source, the currency, the amount and the number never change, a processed invoice is final, and none is deleted.
CREATE FUNCTION "withdrawals_guard"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'A withdrawal cannot be deleted' USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF NEW."number" IS DISTINCT FROM OLD."number" OR NEW."user_id" IS DISTINCT FROM OLD."user_id" OR NEW."source" IS DISTINCT FROM OLD."source"
		OR NEW."currency" IS DISTINCT FROM OLD."currency" OR NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."requested_at" IS DISTINCT FROM OLD."requested_at" THEN
		RAISE EXCEPTION 'The number, the owner and the amount of a withdrawal cannot be changed' USING ERRCODE = 'check_violation';
	END IF;
	IF OLD."status" <> 'PENDING' THEN
		RAISE EXCEPTION 'A processed withdrawal is final' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "withdrawals_guard" BEFORE UPDATE OR DELETE ON "withdrawals" FOR EACH ROW EXECUTE FUNCTION "withdrawals_guard"();
