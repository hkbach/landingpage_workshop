ALTER TABLE "withdrawals" ADD COLUMN "bank_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "bank_account_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_bank" CHECK (char_length("withdrawals"."bank_name") <= 100 AND char_length("withdrawals"."bank_account_number") <= 34);