CREATE TYPE "public"."inbound_financial_status" AS ENUM('pending', 'classified', 'waived');--> statement-breakpoint
CREATE TYPE "public"."inbound_payment_kind" AS ENUM('supplier', 'card');--> statement-breakpoint
CREATE TABLE "company_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"issuer_id" uuid NOT NULL,
	"card_brand_id" uuid,
	"closing_day" smallint NOT NULL,
	"due_day" smallint NOT NULL,
	"bank_account_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "company_cards_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "company_cards_tenant_name_unique" UNIQUE("tenant_id","name"),
	CONSTRAINT "company_cards_closing_day_check" CHECK ("company_cards"."closing_day" between 1 and 28),
	CONSTRAINT "company_cards_due_day_check" CHECK ("company_cards"."due_day" between 1 and 28),
	CONSTRAINT "company_cards_name_not_blank" CHECK (length(trim("company_cards"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "payables" ADD COLUMN "company_card_id" uuid;--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD COLUMN "xml_payment_code" varchar(2);--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD COLUMN "xml_payment_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD COLUMN "financial_status" "inbound_financial_status" DEFAULT 'classified' NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD COLUMN "payment_kind" "inbound_payment_kind" DEFAULT 'supplier';--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD COLUMN "waiver_reason" varchar(255);--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD COLUMN "company_card_id" uuid;--> statement-breakpoint
ALTER TABLE "company_cards" ADD CONSTRAINT "company_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_cards" ADD CONSTRAINT "company_cards_card_brand_id_card_brands_id_fk" FOREIGN KEY ("card_brand_id") REFERENCES "public"."card_brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_cards" ADD CONSTRAINT "company_cards_issuer_tenant_fk" FOREIGN KEY ("issuer_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_cards" ADD CONSTRAINT "company_cards_bank_account_tenant_fk" FOREIGN KEY ("bank_account_id","tenant_id") REFERENCES "public"."bank_accounts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_company_card_tenant_fk" FOREIGN KEY ("company_card_id","tenant_id") REFERENCES "public"."company_cards"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD CONSTRAINT "inbound_documents_company_card_tenant_fk" FOREIGN KEY ("company_card_id","tenant_id") REFERENCES "public"."company_cards"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD CONSTRAINT "inbound_documents_finance_check" CHECK ((
        "inbound_documents"."financial_status" = 'pending'
        and "inbound_documents"."payment_kind" is null
        and "inbound_documents"."company_card_id" is null
        and "inbound_documents"."waiver_reason" is null
      ) or (
        "inbound_documents"."financial_status" = 'classified'
        and "inbound_documents"."payment_kind" = 'supplier'
        and "inbound_documents"."company_card_id" is null
      ) or (
        "inbound_documents"."financial_status" = 'classified'
        and "inbound_documents"."payment_kind" = 'card'
        and "inbound_documents"."company_card_id" is not null
      ) or (
        "inbound_documents"."financial_status" = 'waived'
        and "inbound_documents"."payment_kind" is null
        and "inbound_documents"."company_card_id" is null
        and "inbound_documents"."waiver_reason" is not null
        and length(trim("inbound_documents"."waiver_reason")) > 0
      ));--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD CONSTRAINT "inbound_documents_xml_payment_code_check" CHECK ("inbound_documents"."xml_payment_code" is null or "inbound_documents"."xml_payment_code" ~ '^[0-9]{2}$');--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD CONSTRAINT "inbound_documents_xml_payment_amount_check" CHECK ("inbound_documents"."xml_payment_amount" >= 0);