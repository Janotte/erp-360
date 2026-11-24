ALTER TABLE "catalog_items" ADD COLUMN "national_service_code" varchar(6);--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "municipal_service_code" varchar(3);--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "iss_rate" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "service_description" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_service_fields_check" CHECK ((
        "catalog_items"."type" = 'service'
        or (
          "catalog_items"."national_service_code" is null
          and "catalog_items"."municipal_service_code" is null
          and "catalog_items"."iss_rate" is null
          and "catalog_items"."service_description" is null
        )
      ));--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_national_service_code_check" CHECK ("catalog_items"."national_service_code" is null or "catalog_items"."national_service_code" ~ '^[0-9]{6}$');--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_municipal_service_code_check" CHECK ("catalog_items"."municipal_service_code" is null or "catalog_items"."municipal_service_code" ~ '^[0-9]{3}$');--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_iss_rate_check" CHECK ("catalog_items"."iss_rate" is null or ("catalog_items"."iss_rate" >= 0 and "catalog_items"."iss_rate" < 10));--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_service_description_check" CHECK ((
        "catalog_items"."service_description" is null
        or (
          length(trim("catalog_items"."service_description")) > 0
          and length("catalog_items"."service_description") <= 2000
          and "catalog_items"."service_description" = upper("catalog_items"."service_description")
        )
      ));