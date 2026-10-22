CREATE TYPE "public"."cfop_scope" AS ENUM('internal', 'interstate', 'import');--> statement-breakpoint
CREATE TYPE "public"."fiscal_purpose" AS ENUM('resale', 'industrialization', 'consumption', 'fixed_asset', 'service');--> statement-breakpoint
CREATE TYPE "public"."inbound_status" AS ENUM('pending', 'pre_note', 'divergent', 'posted', 'reversed', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."operation_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."stock_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TABLE "cfop_entry_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_cfop" varchar(4) NOT NULL,
	"scope" "cfop_scope" NOT NULL,
	"fiscal_purpose" "fiscal_purpose" NOT NULL,
	"entry_cfop" varchar(4) NOT NULL,
	CONSTRAINT "cfop_entry_rules_identity_unique" UNIQUE("tenant_id","source_cfop","scope","fiscal_purpose"),
	CONSTRAINT "cfop_entry_rules_digits" CHECK ("cfop_entry_rules"."source_cfop" ~ '^[0-9]{4}$' and "cfop_entry_rules"."entry_cfop" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "inbound_document_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"content" "bytea" NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_document_files_sha256_hex" CHECK ("inbound_document_files"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "inbound_document_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"number" varchar(3) NOT NULL,
	"due_on" date NOT NULL,
	"amount" integer NOT NULL,
	"payable_id" uuid,
	CONSTRAINT "inbound_document_installments_number_unique" UNIQUE("tenant_id","document_id","number"),
	CONSTRAINT "inbound_document_installments_amount_positive" CHECK ("inbound_document_installments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "inbound_document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"supplier_code" varchar(60) NOT NULL,
	"description" varchar(120) NOT NULL,
	"ncm_code" varchar(8),
	"barcode" varchar(14),
	"xml_cfop" varchar(4) NOT NULL,
	"entry_cfop" varchar(4),
	"commercial_qty" numeric(15, 4) NOT NULL,
	"commercial_unit" varchar(6) NOT NULL,
	"factor" numeric(15, 6) DEFAULT '1' NOT NULL,
	"unit_price" numeric(15, 4) NOT NULL,
	"line_amount" integer NOT NULL,
	"freight_amount" integer DEFAULT 0 NOT NULL,
	"insurance_amount" integer DEFAULT 0 NOT NULL,
	"other_amount" integer DEFAULT 0 NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"ipi_amount" integer DEFAULT 0 NOT NULL,
	"st_amount" integer DEFAULT 0 NOT NULL,
	"icms_amount" integer DEFAULT 0 NOT NULL,
	"item_id" uuid,
	"unit_cost" numeric(15, 4),
	CONSTRAINT "inbound_document_lines_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "inbound_document_lines_number_unique" UNIQUE("tenant_id","document_id","line_number"),
	CONSTRAINT "inbound_document_lines_qty_positive" CHECK ("inbound_document_lines"."commercial_qty" > 0),
	CONSTRAINT "inbound_document_lines_factor_positive" CHECK ("inbound_document_lines"."factor" > 0),
	CONSTRAINT "inbound_document_lines_cfop_digits" CHECK ("inbound_document_lines"."xml_cfop" ~ '^[0-9]{4}$' and ("inbound_document_lines"."entry_cfop" is null or "inbound_document_lines"."entry_cfop" ~ '^[0-9]{4}$'))
);
--> statement-breakpoint
CREATE TABLE "inbound_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "inbound_status" DEFAULT 'pre_note' NOT NULL,
	"model" varchar(2) DEFAULT '55' NOT NULL,
	"access_key" varchar(44),
	"number" varchar(9) NOT NULL,
	"series" varchar(3) NOT NULL,
	"issue_on" date NOT NULL,
	"inbound_on" date,
	"supplier_id" uuid,
	"supplier_tax_id" varchar(14),
	"supplier_name" varchar(120),
	"nature_id" uuid,
	"has_protocol" boolean DEFAULT false NOT NULL,
	"total_amount" integer NOT NULL,
	"moves_stock" boolean,
	"creates_payable" boolean,
	"updates_average_cost" boolean,
	"posted_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_documents_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "inbound_documents_access_key_digits" CHECK ("inbound_documents"."access_key" is null or "inbound_documents"."access_key" ~ '^[0-9]{44}$'),
	CONSTRAINT "inbound_documents_total_non_negative" CHECK ("inbound_documents"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "operation_natures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(60) NOT NULL,
	"direction" "operation_direction" NOT NULL,
	"fiscal_purpose" "fiscal_purpose" NOT NULL,
	"moves_stock" boolean NOT NULL,
	"creates_payable" boolean NOT NULL,
	"updates_average_cost" boolean NOT NULL,
	"records_entry_price" boolean NOT NULL,
	"suggests_list_price" boolean NOT NULL,
	"freight_in_cost" boolean DEFAULT true NOT NULL,
	"insurance_in_cost" boolean DEFAULT true NOT NULL,
	"other_in_cost" boolean DEFAULT true NOT NULL,
	"discount_in_cost" boolean DEFAULT true NOT NULL,
	"ipi_in_cost" boolean DEFAULT false NOT NULL,
	"st_in_cost" boolean DEFAULT true NOT NULL,
	"icms_in_cost" boolean DEFAULT false NOT NULL,
	"plan_account_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "operation_natures_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "operation_natures_tenant_code_unique" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
	"average_cost" numeric(15, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "stock_balances_tenant_id_item_id_pk" PRIMARY KEY("tenant_id","item_id"),
	CONSTRAINT "stock_balances_quantity_non_negative" CHECK ("stock_balances"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"direction" "stock_direction" NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_cost" numeric(15, 4) NOT NULL,
	"occurred_on" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_quantity_positive" CHECK ("stock_movements"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_item_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_code" varchar(60) NOT NULL,
	"item_id" uuid NOT NULL,
	"supplier_unit" varchar(6) NOT NULL,
	"factor" numeric(15, 6) DEFAULT '1' NOT NULL,
	CONSTRAINT "supplier_item_links_code_unique" UNIQUE("tenant_id","supplier_id","supplier_code"),
	CONSTRAINT "supplier_item_links_factor_positive" CHECK ("supplier_item_links"."factor" > 0),
	CONSTRAINT "supplier_item_links_code_not_blank" CHECK (length(trim("supplier_item_links"."supplier_code")) > 0)
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "last_inbound_on" date;--> statement-breakpoint
ALTER TABLE "cfop_entry_rules" ADD CONSTRAINT "cfop_entry_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_document_files" ADD CONSTRAINT "inbound_document_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_document_files" ADD CONSTRAINT "inbound_document_files_document_tenant_fk" FOREIGN KEY ("document_id","tenant_id") REFERENCES "public"."inbound_documents"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_document_installments" ADD CONSTRAINT "inbound_document_installments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_document_installments" ADD CONSTRAINT "inbound_document_installments_document_tenant_fk" FOREIGN KEY ("document_id","tenant_id") REFERENCES "public"."inbound_documents"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_document_installments" ADD CONSTRAINT "inbound_document_installments_payable_tenant_fk" FOREIGN KEY ("payable_id","tenant_id") REFERENCES "public"."payables"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_document_lines" ADD CONSTRAINT "inbound_document_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_document_lines" ADD CONSTRAINT "inbound_document_lines_document_tenant_fk" FOREIGN KEY ("document_id","tenant_id") REFERENCES "public"."inbound_documents"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_document_lines" ADD CONSTRAINT "inbound_document_lines_item_tenant_fk" FOREIGN KEY ("item_id","tenant_id") REFERENCES "public"."catalog_items"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD CONSTRAINT "inbound_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD CONSTRAINT "inbound_documents_supplier_tenant_fk" FOREIGN KEY ("supplier_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD CONSTRAINT "inbound_documents_nature_tenant_fk" FOREIGN KEY ("nature_id","tenant_id") REFERENCES "public"."operation_natures"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_natures" ADD CONSTRAINT "operation_natures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_natures" ADD CONSTRAINT "operation_natures_plan_account_tenant_fk" FOREIGN KEY ("plan_account_id","tenant_id") REFERENCES "public"."plan_accounts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_tenant_fk" FOREIGN KEY ("item_id","tenant_id") REFERENCES "public"."catalog_items"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_tenant_fk" FOREIGN KEY ("item_id","tenant_id") REFERENCES "public"."catalog_items"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_document_tenant_fk" FOREIGN KEY ("document_id","tenant_id") REFERENCES "public"."inbound_documents"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_line_tenant_fk" FOREIGN KEY ("line_id","tenant_id") REFERENCES "public"."inbound_document_lines"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_item_links" ADD CONSTRAINT "supplier_item_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_item_links" ADD CONSTRAINT "supplier_item_links_supplier_tenant_fk" FOREIGN KEY ("supplier_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_item_links" ADD CONSTRAINT "supplier_item_links_item_tenant_fk" FOREIGN KEY ("item_id","tenant_id") REFERENCES "public"."catalog_items"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_documents_tenant_access_key_unique" ON "inbound_documents" USING btree ("tenant_id","access_key") WHERE "inbound_documents"."access_key" is not null;--> statement-breakpoint
CREATE INDEX "inbound_documents_tenant_status_idx" ON "inbound_documents" USING btree ("tenant_id","status","issue_on");--> statement-breakpoint
CREATE INDEX "stock_movements_document_idx" ON "stock_movements" USING btree ("tenant_id","document_id");