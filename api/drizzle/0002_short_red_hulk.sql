CREATE TABLE IF NOT EXISTS "account_interest_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"rate" numeric(6, 3) NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "interest_accrued_thru" date;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_interest_rates_account_from" ON "account_interest_rates" ("account_id","effective_from");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_interest_rates" ADD CONSTRAINT "account_interest_rates_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
