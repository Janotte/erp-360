ALTER TABLE "bank_accounts" ADD COLUMN "opening_on" date;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "opening_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD COLUMN "opening_balance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD COLUMN "opening_balance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_settings" ADD COLUMN "cash_opening_on" date;--> statement-breakpoint
ALTER TABLE "financial_settings" ADD COLUMN "cash_opening_amount" integer DEFAULT 0 NOT NULL;