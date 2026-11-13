-- The name of the account owner belongs to the request like the rest of the bank details: it never changes afterwards.
CREATE OR REPLACE FUNCTION "withdrawals_guard"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'A withdrawal cannot be deleted' USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF NEW."number" IS DISTINCT FROM OLD."number" OR NEW."user_id" IS DISTINCT FROM OLD."user_id" OR NEW."source" IS DISTINCT FROM OLD."source"
		OR NEW."currency" IS DISTINCT FROM OLD."currency" OR NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."requested_at" IS DISTINCT FROM OLD."requested_at"
		OR NEW."bank_name" IS DISTINCT FROM OLD."bank_name" OR NEW."bank_account_number" IS DISTINCT FROM OLD."bank_account_number"
		OR NEW."bank_account_holder" IS DISTINCT FROM OLD."bank_account_holder" THEN
		RAISE EXCEPTION 'The number, the owner, the amount and the bank details of a withdrawal cannot be changed' USING ERRCODE = 'check_violation';
	END IF;
	IF OLD."status" <> 'PENDING' THEN
		RAISE EXCEPTION 'A processed withdrawal is final' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
