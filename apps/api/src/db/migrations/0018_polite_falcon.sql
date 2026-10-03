CREATE TYPE "public"."type_plan_account" AS ENUM('revenue', 'expense', 'bank', 'withdrawal');--> statement-breakpoint
ALTER TABLE "plan_accounts" ALTER COLUMN "account_code" SET DATA TYPE varchar(10);--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "type" "type_plan_account";--> statement-breakpoint
UPDATE "plan_accounts" SET "type" = CASE
	WHEN "account_code" LIKE '1%' THEN 'revenue'::"type_plan_account"
	WHEN "account_code" LIKE '2%' THEN 'expense'::"type_plan_account"
	WHEN "account_code" LIKE '3%' THEN 'bank'::"type_plan_account"
	WHEN "account_code" LIKE '4%' THEN 'withdrawal'::"type_plan_account"
	ELSE 'expense'::"type_plan_account"
END;--> statement-breakpoint
ALTER TABLE "plan_accounts" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "parent_account_code" varchar(10);--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
