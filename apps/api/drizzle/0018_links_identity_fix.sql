-- The first version of this function read a column that only an affiliate link has, so it failed for an invite link. The check of the workshop now runs only for an affiliate link.
CREATE OR REPLACE FUNCTION "links_identity_immutable"() RETURNS trigger AS $$
BEGIN
	IF NEW."code" IS DISTINCT FROM OLD."code" OR NEW."user_id" IS DISTINCT FROM OLD."user_id" THEN
		RAISE EXCEPTION 'The code and the owner of a link cannot be changed' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_TABLE_NAME = 'affiliate_links' THEN
		IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR NEW."workshop_id" IS DISTINCT FROM OLD."workshop_id" THEN
			RAISE EXCEPTION 'The workshop of a link cannot be changed' USING ERRCODE = 'check_violation';
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
