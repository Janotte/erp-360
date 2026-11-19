ALTER TABLE "catalog_categories" ADD COLUMN "show_on_product" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD COLUMN "show_on_service" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "catalog_categories" SET "show_on_product" = true, "show_on_service" = true;--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_visibility_check" CHECK ("catalog_categories"."show_on_product" or "catalog_categories"."show_on_service");