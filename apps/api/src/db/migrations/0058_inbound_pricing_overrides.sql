CREATE TABLE "inbound_pricing_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "gross_margin" numeric(8, 4),
  CONSTRAINT "inbound_pricing_overrides_item_unique" UNIQUE("tenant_id","document_id","item_id"),
  CONSTRAINT "inbound_pricing_overrides_margin_check" CHECK ("gross_margin" is null OR ("gross_margin" >= 0 AND "gross_margin" < 100))
);
--> statement-breakpoint
ALTER TABLE "inbound_pricing_overrides" ADD CONSTRAINT "inbound_pricing_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_pricing_overrides" ADD CONSTRAINT "inbound_pricing_overrides_document_tenant_fk" FOREIGN KEY ("document_id","tenant_id") REFERENCES "public"."inbound_documents"("id","tenant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_pricing_overrides" ADD CONSTRAINT "inbound_pricing_overrides_item_tenant_fk" FOREIGN KEY ("item_id","tenant_id") REFERENCES "public"."catalog_items"("id","tenant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "catalog_items" DROP CONSTRAINT "catalog_items_gross_margin_check";
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_gross_margin_check" CHECK ("gross_margin" is null OR ("gross_margin" >= 0 AND "gross_margin" < 100));
