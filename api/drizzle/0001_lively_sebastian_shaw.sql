CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"initial_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_single_default" ON "accounts" ("is_default") WHERE "is_default";--> statement-breakpoint
INSERT INTO "accounts" ("name", "currency", "is_default", "sort_order")
VALUES ('Общий', 'RUB', true, 0), ('Инвестиционный', 'RUB', false, 1), ('Валютный', 'USD', false, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "to_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "to_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "rate" numeric(14, 6);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "base_amount" numeric(12, 2);--> statement-breakpoint
UPDATE "transactions" SET
	"account_id" = (SELECT "id" FROM "accounts" WHERE "is_default"),
	"base_amount" = "amount";--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "base_amount" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
