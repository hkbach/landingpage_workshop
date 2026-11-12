-- BR-21: the slug of a shop is made once and never changes, not even for an administrator. The trigger is the last line of defence; the API never updates it either.
CREATE FUNCTION "organizations_slug_immutable"() RETURNS trigger AS $$
BEGIN
	IF NEW."slug" IS DISTINCT FROM OLD."slug" THEN
		RAISE EXCEPTION 'The slug of an organization cannot be changed' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "organizations_slug_immutable" BEFORE UPDATE ON "organizations" FOR EACH ROW EXECUTE FUNCTION "organizations_slug_immutable"();
--> statement-breakpoint
-- REQUIREMENTS 8.6: the audit log only grows. Nothing updates or deletes a line, not even the API.
CREATE FUNCTION "audit_logs_append_only"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'The audit log is append only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "audit_logs_append_only" BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"();
--> statement-breakpoint
CREATE TRIGGER "audit_logs_no_truncate" BEFORE TRUNCATE ON "audit_logs" FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_append_only"();
