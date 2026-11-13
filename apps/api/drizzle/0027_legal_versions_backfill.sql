-- D17: what is live now becomes the first published version of its document (before this there was no history), and the rest of the history can only grow.
INSERT INTO "legal_versions" ("kind", "locale", "version", "content", "status", "major", "epoch", "created_by", "created_at", "updated_at", "published_by", "published_at")
SELECT "kind", "locale", "version", "content", 'PUBLISHED', false, 0, "updated_by", "updated_at", "updated_at", "updated_by", "updated_at" FROM "legal_documents";
--> statement-breakpoint
-- A published version is never changed or deleted: it is what people agreed to. A draft may be changed, deleted, or published (the only change that is allowed to leave it).
CREATE FUNCTION "legal_versions_guard"() RETURNS trigger AS $$
BEGIN
	IF OLD."status" = 'PUBLISHED' THEN
		RAISE EXCEPTION 'A published version cannot be changed or deleted' USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF TG_OP = 'DELETE' THEN
		RETURN OLD;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "legal_versions_guard" BEFORE UPDATE OR DELETE ON "legal_versions" FOR EACH ROW EXECUTE FUNCTION "legal_versions_guard"();
--> statement-breakpoint
-- What a user agreed to is a record of a fact: it only grows.
CREATE FUNCTION "legal_consents_append_only"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'A consent is append only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "legal_consents_append_only" BEFORE UPDATE OR DELETE ON "legal_consents" FOR EACH ROW EXECUTE FUNCTION "legal_consents_append_only"();
