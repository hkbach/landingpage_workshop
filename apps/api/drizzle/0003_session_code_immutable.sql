-- The code of a session ("SES-0001") is made by the system and never changes (REQUIREMENTS 8.4); the organization and the workshop of a session never change either (a session cannot move to
-- another shop). The trigger is the last line of defence: the API never updates these columns.
CREATE FUNCTION "workshop_sessions_identity_immutable"() RETURNS trigger AS $$
BEGIN
	IF NEW."code" IS DISTINCT FROM OLD."code" OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR NEW."workshop_id" IS DISTINCT FROM OLD."workshop_id" THEN
		RAISE EXCEPTION 'The code, the shop and the workshop of a session cannot be changed' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "workshop_sessions_identity_immutable" BEFORE UPDATE ON "workshop_sessions" FOR EACH ROW EXECUTE FUNCTION "workshop_sessions_identity_immutable"();
--> statement-breakpoint
-- The same for a workshop: it never moves to another shop, and its currency (the one of the shop when it was made) is not edited on its own.
CREATE FUNCTION "workshops_identity_immutable"() RETURNS trigger AS $$
BEGIN
	IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id" THEN
		RAISE EXCEPTION 'A workshop cannot move to another shop' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "workshops_identity_immutable" BEFORE UPDATE ON "workshops" FOR EACH ROW EXECUTE FUNCTION "workshops_identity_immutable"();
