-- D11: a closed month is written down once and never edited or deleted (its figures and the rates used stay as they were when it was closed).
CREATE FUNCTION "finance_month_closings_append_only"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'A closed month cannot be changed' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "finance_month_closings_append_only" BEFORE UPDATE OR DELETE ON "finance_month_closings" FOR EACH ROW EXECUTE FUNCTION "finance_month_closings_append_only"();
--> statement-breakpoint
CREATE TRIGGER "finance_month_closings_no_truncate" BEFORE TRUNCATE ON "finance_month_closings" FOR EACH STATEMENT EXECUTE FUNCTION "finance_month_closings_append_only"();
