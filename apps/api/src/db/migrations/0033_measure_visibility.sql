ALTER TABLE "measures" ADD COLUMN "show_on_product" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "measures" ADD COLUMN "show_on_service" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "measures" SET "show_on_product" = true, "show_on_service" = true;--> statement-breakpoint
ALTER TABLE "measures" ADD CONSTRAINT "measures_visibility_check" CHECK ("measures"."show_on_product" or "measures"."show_on_service");