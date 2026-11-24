CREATE TYPE "public"."billing_commercial_status" AS ENUM('issued', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."billing_fiscal_status" AS ENUM('not_requested', 'pending', 'authorized', 'rejected', 'canceled');--> statement-breakpoint
CREATE TABLE "billing_document_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "billing_document_counters_last_number_check" CHECK ("billing_document_counters"."last_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "billing_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"person_id" uuid NOT NULL,
	"service_order_id" uuid NOT NULL,
	"products_amount" integer NOT NULL,
	"services_amount" integer NOT NULL,
	"freight_amount" integer NOT NULL,
	"discount_amount" integer NOT NULL,
	"surcharge_amount" integer NOT NULL,
	"total_amount" integer NOT NULL,
	"commercial_status" "billing_commercial_status" DEFAULT 'issued' NOT NULL,
	"fiscal_status" "billing_fiscal_status" DEFAULT 'not_requested' NOT NULL,
	"issued_on" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_documents_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "billing_documents_tenant_number_unique" UNIQUE("tenant_id","number"),
	CONSTRAINT "billing_documents_tenant_order_unique" UNIQUE("tenant_id","service_order_id"),
	CONSTRAINT "billing_documents_number_check" CHECK ("billing_documents"."number" > 0),
	CONSTRAINT "billing_documents_products_check" CHECK ("billing_documents"."products_amount" >= 0),
	CONSTRAINT "billing_documents_services_check" CHECK ("billing_documents"."services_amount" >= 0),
	CONSTRAINT "billing_documents_freight_check" CHECK ("billing_documents"."freight_amount" >= 0),
	CONSTRAINT "billing_documents_discount_check" CHECK ("billing_documents"."discount_amount" >= 0),
	CONSTRAINT "billing_documents_surcharge_check" CHECK ("billing_documents"."surcharge_amount" >= 0),
	CONSTRAINT "billing_documents_total_check" CHECK ("billing_documents"."total_amount" >= 0),
	CONSTRAINT "billing_documents_total_formula_check" CHECK ("billing_documents"."total_amount" = "billing_documents"."products_amount" + "billing_documents"."services_amount" + "billing_documents"."freight_amount" - "billing_documents"."discount_amount" + "billing_documents"."surcharge_amount")
);
--> statement-breakpoint
ALTER TABLE "billing_document_counters" ADD CONSTRAINT "billing_document_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_person_tenant_fk" FOREIGN KEY ("person_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_order_tenant_fk" FOREIGN KEY ("service_order_id","tenant_id") REFERENCES "public"."service_orders"("id","tenant_id") ON DELETE restrict ON UPDATE no action;