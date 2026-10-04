CREATE TYPE "public"."remainder_mode" AS ENUM('none', 'new_title', 'plan_account');--> statement-breakpoint
CREATE TYPE "public"."settlement_kind" AS ENUM('payable', 'receivable');--> statement-breakpoint
CREATE TYPE "public"."treasury_kind" AS ENUM('cash', 'bank');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"branch_number" varchar(10),
	"account_code" varchar(16),
	"plan_account_id" uuid,
	"balance" integer DEFAULT 0 NOT NULL,
	"financial_institution_id" uuid,
	"static_pix_flag" varchar(1),
	"pix_key_type" varchar(20),
	"pix_holder_name" varchar(25),
	"pix_key" varchar(40),
	CONSTRAINT "bank_accounts_tenant_name_unique" UNIQUE("tenant_id","name"),
	CONSTRAINT "bank_accounts_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "bank_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"plan_account_id" uuid,
	"description" varchar(255) NOT NULL,
	"inflow_amount" integer DEFAULT 0 NOT NULL,
	"outflow_amount" integer DEFAULT 0 NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"receivable_id" uuid,
	"payable_id" uuid,
	"settlement_id" uuid,
	"reconciled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"plan_account_id" uuid,
	"description" varchar(255) NOT NULL,
	"inflow_amount" integer DEFAULT 0 NOT NULL,
	"outflow_amount" integer DEFAULT 0 NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"receivable_id" uuid,
	"payable_id" uuid,
	"settlement_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"late_fee_bps" integer DEFAULT 200 NOT NULL,
	"daily_interest_bps" integer DEFAULT 3 NOT NULL,
	"grace_days" integer DEFAULT 0 NOT NULL,
	"cash_plan_account_id" uuid,
	"discount_obtained_plan_account_id" uuid,
	"discount_granted_plan_account_id" uuid,
	"late_fee_paid_plan_account_id" uuid,
	"late_fee_received_plan_account_id" uuid
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "settlement_kind" NOT NULL,
	"title_id" uuid NOT NULL,
	"settled_on" date NOT NULL,
	"treasury" "treasury_kind" NOT NULL,
	"bank_account_id" uuid,
	"original_amount" integer NOT NULL,
	"fine_amount" integer DEFAULT 0 NOT NULL,
	"interest_amount" integer DEFAULT 0 NOT NULL,
	"due_amount" integer NOT NULL,
	"settled_amount" integer NOT NULL,
	"waived_charges" boolean DEFAULT false NOT NULL,
	"remainder_mode" "remainder_mode" DEFAULT 'none' NOT NULL,
	"difference_plan_account_id" uuid,
	"include_charges_on_new_title" boolean DEFAULT false NOT NULL,
	"created_title_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "original_title_id" uuid;--> statement-breakpoint
ALTER TABLE "receivables" ADD COLUMN "original_title_id" uuid;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_id_tenant_id_unique" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_id_tenant_id_unique" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_plan_account_tenant_fk" FOREIGN KEY ("plan_account_id","tenant_id") REFERENCES "public"."plan_accounts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_financial_institution_tenant_fk" FOREIGN KEY ("financial_institution_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_bank_account_tenant_fk" FOREIGN KEY ("bank_account_id","tenant_id") REFERENCES "public"."bank_accounts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_plan_account_tenant_fk" FOREIGN KEY ("plan_account_id","tenant_id") REFERENCES "public"."plan_accounts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_receivable_tenant_fk" FOREIGN KEY ("receivable_id","tenant_id") REFERENCES "public"."receivables"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_payable_tenant_fk" FOREIGN KEY ("payable_id","tenant_id") REFERENCES "public"."payables"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_plan_account_tenant_fk" FOREIGN KEY ("plan_account_id","tenant_id") REFERENCES "public"."plan_accounts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_receivable_tenant_fk" FOREIGN KEY ("receivable_id","tenant_id") REFERENCES "public"."receivables"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_payable_tenant_fk" FOREIGN KEY ("payable_id","tenant_id") REFERENCES "public"."payables"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_settings" ADD CONSTRAINT "financial_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_settings" ADD CONSTRAINT "financial_settings_cash_plan_account_id_plan_accounts_id_fk" FOREIGN KEY ("cash_plan_account_id") REFERENCES "public"."plan_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_settings" ADD CONSTRAINT "financial_settings_discount_obtained_plan_account_id_plan_accounts_id_fk" FOREIGN KEY ("discount_obtained_plan_account_id") REFERENCES "public"."plan_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_settings" ADD CONSTRAINT "financial_settings_discount_granted_plan_account_id_plan_accounts_id_fk" FOREIGN KEY ("discount_granted_plan_account_id") REFERENCES "public"."plan_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_settings" ADD CONSTRAINT "financial_settings_late_fee_paid_plan_account_id_plan_accounts_id_fk" FOREIGN KEY ("late_fee_paid_plan_account_id") REFERENCES "public"."plan_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_settings" ADD CONSTRAINT "financial_settings_late_fee_received_plan_account_id_plan_accounts_id_fk" FOREIGN KEY ("late_fee_received_plan_account_id") REFERENCES "public"."plan_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_difference_plan_account_id_plan_accounts_id_fk" FOREIGN KEY ("difference_plan_account_id") REFERENCES "public"."plan_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_original_title_tenant_fk" FOREIGN KEY ("original_title_id","tenant_id") REFERENCES "public"."payables"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_original_title_tenant_fk" FOREIGN KEY ("original_title_id","tenant_id") REFERENCES "public"."receivables"("id","tenant_id") ON DELETE restrict ON UPDATE no action;