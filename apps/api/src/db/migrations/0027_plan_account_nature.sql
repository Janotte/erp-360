CREATE TYPE "public"."plan_account_dre_line" AS ENUM('gross_revenue', 'deduction', 'cost', 'operating_expense', 'financial_income', 'financial_expense', 'other_income', 'other_expense');--> statement-breakpoint
CREATE TYPE "public"."plan_account_nature" AS ENUM('asset', 'liability', 'equity', 'revenue', 'expense');--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "nature" "plan_account_nature";--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "dre_line" "plan_account_dre_line";--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "accepts_entries" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "is_treasury" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "plan_accounts" SET
  "nature" = CASE "type"
    WHEN 'revenue' THEN 'revenue'::"plan_account_nature"
    WHEN 'expense' THEN 'expense'::"plan_account_nature"
    WHEN 'bank' THEN 'asset'::"plan_account_nature"
    WHEN 'withdrawal' THEN 'equity'::"plan_account_nature"
  END,
  "dre_line" = CASE "type"
    WHEN 'revenue' THEN 'gross_revenue'::"plan_account_dre_line"
    WHEN 'expense' THEN 'operating_expense'::"plan_account_dre_line"
    ELSE NULL
  END,
  "is_treasury" = ("type" = 'bank'),
  "accepts_entries" = true;--> statement-breakpoint
ALTER TABLE "plan_accounts" ALTER COLUMN "nature" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD CONSTRAINT "plan_accounts_dre_line_nature_check" CHECK ((
        ("plan_accounts"."nature" = 'revenue' AND "plan_accounts"."dre_line" IN ('gross_revenue', 'financial_income', 'other_income'))
        OR ("plan_accounts"."nature" = 'expense' AND "plan_accounts"."dre_line" IN ('deduction', 'cost', 'operating_expense', 'financial_expense', 'other_expense'))
        OR ("plan_accounts"."nature" IN ('asset', 'liability', 'equity') AND "plan_accounts"."dre_line" IS NULL)
      ) AND ("plan_accounts"."is_treasury" = false OR "plan_accounts"."nature" = 'asset'));
