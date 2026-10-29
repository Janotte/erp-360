CREATE TYPE "public"."payment_interest_type" AS ENUM('none', 'simple', 'price', 'flat', 'issuer');--> statement-breakpoint
CREATE TYPE "public"."payment_integration_type" AS ENUM('integrated', 'not_integrated');--> statement-breakpoint
CREATE TYPE "public"."payment_receipt_kind" AS ENUM('cash', 'bank', 'customer_receivable', 'acquirer_receivable', 'store_credit');--> statement-breakpoint
CREATE TABLE "payment_method_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"installment_count" integer NOT NULL,
	"first_due_days" integer DEFAULT 0 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"interest_type" "payment_interest_type" DEFAULT 'none' NOT NULL,
	"interest_rate_bps" integer DEFAULT 0 NOT NULL,
	"administrative_fee_bps" integer DEFAULT 0 NOT NULL,
	"fixed_fee_amount" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "payment_method_terms_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "payment_method_terms_method_count_unique" UNIQUE("tenant_id","payment_method_id","installment_count"),
	CONSTRAINT "payment_method_terms_installment_count_check" CHECK ("payment_method_terms"."installment_count" between 1 and 48),
	CONSTRAINT "payment_method_terms_first_due_days_check" CHECK ("payment_method_terms"."first_due_days" between 0 and 365),
	CONSTRAINT "payment_method_terms_interval_days_check" CHECK ((
        ("payment_method_terms"."installment_count" = 1 and "payment_method_terms"."interval_days" = 0)
        or ("payment_method_terms"."installment_count" > 1 and "payment_method_terms"."interval_days" between 1 and 365)
      )),
	CONSTRAINT "payment_method_terms_interest_rate_check" CHECK ("payment_method_terms"."interest_rate_bps" between 0 and 10000 and (
        ("payment_method_terms"."interest_type" in ('none', 'issuer') and "payment_method_terms"."interest_rate_bps" = 0)
        or ("payment_method_terms"."interest_type" in ('simple', 'price', 'flat') and "payment_method_terms"."interest_rate_bps" > 0)
      )),
	CONSTRAINT "payment_method_terms_administrative_fee_check" CHECK ("payment_method_terms"."administrative_fee_bps" between 0 and 10000),
	CONSTRAINT "payment_method_terms_fixed_fee_check" CHECK ("payment_method_terms"."fixed_fee_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(15) NOT NULL,
	"name" varchar(60) NOT NULL,
	"means_of_payment_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"receipt_kind" "payment_receipt_kind" NOT NULL,
	"settlement_days" integer,
	"integration_type" "payment_integration_type",
	"acquirer_id" uuid,
	"card_brand_id" uuid,
	"bank_account_id" uuid,
	"use_in_quote" boolean DEFAULT true NOT NULL,
	"use_in_sale" boolean DEFAULT true NOT NULL,
	"use_in_pos" boolean DEFAULT true NOT NULL,
	"use_in_service_order" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "payment_methods_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "payment_methods_tenant_code_unique" UNIQUE("tenant_id","code"),
	CONSTRAINT "payment_methods_tenant_name_unique" UNIQUE("tenant_id","name"),
	CONSTRAINT "payment_methods_code_format" CHECK ("payment_methods"."code" ~ '^[A-Z0-9][A-Z0-9-]{0,14}$'),
	CONSTRAINT "payment_methods_name_not_blank" CHECK (length(trim("payment_methods"."name")) > 0),
	CONSTRAINT "payment_methods_settlement_days_check" CHECK ("payment_methods"."settlement_days" is null or "payment_methods"."settlement_days" between 0 and 365),
	CONSTRAINT "payment_methods_settlement_days_kind_check" CHECK ("payment_methods"."receipt_kind" = 'acquirer_receivable' or "payment_methods"."settlement_days" is null),
	CONSTRAINT "payment_methods_acquirer_kind_check" CHECK ("payment_methods"."receipt_kind" <> 'acquirer_receivable' or "payment_methods"."acquirer_id" is not null),
	CONSTRAINT "payment_methods_integrated_acquirer_check" CHECK ("payment_methods"."integration_type" is distinct from 'integrated' or "payment_methods"."acquirer_id" is not null),
	CONSTRAINT "payment_methods_channel_check" CHECK ("payment_methods"."use_in_quote" or "payment_methods"."use_in_sale" or "payment_methods"."use_in_pos" or "payment_methods"."use_in_service_order")
);
--> statement-breakpoint
ALTER TABLE "receivables" ADD COLUMN "payment_method_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_method_terms" ADD CONSTRAINT "payment_method_terms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_terms" ADD CONSTRAINT "payment_method_terms_method_tenant_fk" FOREIGN KEY ("payment_method_id","tenant_id") REFERENCES "public"."payment_methods"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_means_of_payment_id_means_of_payment_id_fk" FOREIGN KEY ("means_of_payment_id") REFERENCES "public"."means_of_payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_card_brand_id_card_brands_id_fk" FOREIGN KEY ("card_brand_id") REFERENCES "public"."card_brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_acquirer_tenant_fk" FOREIGN KEY ("acquirer_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_bank_account_tenant_fk" FOREIGN KEY ("bank_account_id","tenant_id") REFERENCES "public"."bank_accounts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_payment_method_tenant_fk" FOREIGN KEY ("payment_method_id","tenant_id") REFERENCES "public"."payment_methods"("id","tenant_id") ON DELETE restrict ON UPDATE no action;