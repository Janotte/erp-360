ALTER TABLE "catalog_items" ADD COLUMN "sku" varchar(60);--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_tenant_sku_unique" UNIQUE("tenant_id","sku");--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_sku_not_blank" CHECK ("catalog_items"."sku" is null or length(trim("catalog_items"."sku")) > 0);