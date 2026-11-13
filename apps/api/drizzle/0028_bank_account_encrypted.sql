-- The bank account number is stored encrypted (AES-256-GCM, written by the API): the clear text is up to 34 characters, the stored text is longer.
ALTER TABLE "withdrawals" DROP CONSTRAINT "withdrawals_bank";--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_bank" CHECK (char_length("withdrawals"."bank_name") <= 100 AND char_length("withdrawals"."bank_account_number") <= 200 AND char_length("withdrawals"."bank_account_holder") <= 100);--> statement-breakpoint
-- The bank details still never change, with one exception: a number written in clear (before the encryption existed) may be replaced by its encrypted form, on any invoice, and nothing else may change
-- in that same update. `pnpm db:encrypt-bank` checks that the encrypted text decrypts to the same number before it writes it.
CREATE OR REPLACE FUNCTION "withdrawals_guard"() RETURNS trigger AS $$
DECLARE
	representation_only boolean;
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'A withdrawal cannot be deleted' USING ERRCODE = 'insufficient_privilege';
	END IF;
	representation_only := NEW."bank_account_number" IS DISTINCT FROM OLD."bank_account_number"
		AND OLD."bank_account_number" NOT LIKE 'enc:v1:%' AND NEW."bank_account_number" LIKE 'enc:v1:%';
	IF NEW."number" IS DISTINCT FROM OLD."number" OR NEW."user_id" IS DISTINCT FROM OLD."user_id" OR NEW."source" IS DISTINCT FROM OLD."source"
		OR NEW."currency" IS DISTINCT FROM OLD."currency" OR NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."requested_at" IS DISTINCT FROM OLD."requested_at"
		OR NEW."bank_name" IS DISTINCT FROM OLD."bank_name" OR (NEW."bank_account_number" IS DISTINCT FROM OLD."bank_account_number" AND NOT representation_only)
		OR NEW."bank_account_holder" IS DISTINCT FROM OLD."bank_account_holder" THEN
		RAISE EXCEPTION 'The number, the owner, the amount and the bank details of a withdrawal cannot be changed' USING ERRCODE = 'check_violation';
	END IF;
	IF representation_only AND NEW."status" = OLD."status" AND NEW."reason" IS NOT DISTINCT FROM OLD."reason"
		AND NEW."processed_at" IS NOT DISTINCT FROM OLD."processed_at" AND NEW."processed_by" IS NOT DISTINCT FROM OLD."processed_by" THEN
		RETURN NEW;
	END IF;
	IF OLD."status" <> 'PENDING' THEN
		RAISE EXCEPTION 'A processed withdrawal is final' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
