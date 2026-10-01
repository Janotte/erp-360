CREATE TYPE "public"."status_receivable" AS ENUM('pendente', 'recebido', 'cancelado');--> statement-breakpoint
ALTER TYPE "public"."status_financial" RENAME TO "status_payable";--> statement-breakpoint
CREATE TABLE "card_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	CONSTRAINT "card_brands_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "payables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"creditor_id" uuid NOT NULL,
	"document_number" varchar(44),
	"description" varchar(255) NOT NULL,
	"issue_on" date DEFAULT CURRENT_DATE NOT NULL,
	"installment_amount" integer NOT NULL,
	"due_on" date NOT NULL,
	"paid_on" date,
	"paid_amount" integer,
	"plan_account_id" uuid,
	"status" "status_payable" DEFAULT 'pendente' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_type_code" varchar(2) NOT NULL,
	"description" varchar(60) NOT NULL,
	CONSTRAINT "payment_methods_type_code_unique" UNIQUE("payment_type_code")
);
--> statement-breakpoint
CREATE TABLE "plan_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_code" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"day_balance" integer,
	"month_balance" integer,
	"year_balance" integer,
	"balance" integer,
	"accounting_description" varchar(60),
	"account_identifier" varchar(10),
	"accounting_account_code" varchar(20),
	CONSTRAINT "plan_accounts_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "plan_accounts_tenant_account_code_unique" UNIQUE("tenant_id","account_code")
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"debtor_id" uuid NOT NULL,
	"document_number" varchar(44),
	"description" varchar(255) NOT NULL,
	"issue_on" date DEFAULT CURRENT_DATE NOT NULL,
	"installment_amount" integer NOT NULL,
	"due_on" date NOT NULL,
	"received_on" date,
	"received_amount" integer,
	"plan_account_id" uuid,
	"bearer_name" varchar(60),
	"barcode" varchar(50),
	"bank_slip_our_number" varchar(20),
	"invoice_number" varchar(44),
	"financial_institution_id" uuid,
	"payment_method_id" uuid,
	"card_brand_id" uuid,
	"transaction_authorization" varchar(128),
	"status" "status_receivable" DEFAULT 'pendente' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts_payable" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts_receivable" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "accounts_payable" CASCADE;--> statement-breakpoint
DROP TABLE "accounts_receivable" CASCADE;--> statement-breakpoint
ALTER TABLE "persons" ALTER COLUMN "photo" SET DATA TYPE varchar(500);--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "is_financial_institution" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_creditor_tenant_fk" FOREIGN KEY ("creditor_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_plan_account_tenant_fk" FOREIGN KEY ("plan_account_id","tenant_id") REFERENCES "public"."plan_accounts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_accounts" ADD CONSTRAINT "plan_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_card_brand_id_card_brands_id_fk" FOREIGN KEY ("card_brand_id") REFERENCES "public"."card_brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_debtor_tenant_fk" FOREIGN KEY ("debtor_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_plan_account_tenant_fk" FOREIGN KEY ("plan_account_id","tenant_id") REFERENCES "public"."plan_accounts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_financial_institution_tenant_fk" FOREIGN KEY ("financial_institution_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_tax_id_not_blank" CHECK ("persons"."tax_id" is null or length(trim("persons"."tax_id")) > 0);