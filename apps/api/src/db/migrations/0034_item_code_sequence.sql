CREATE TABLE "catalog_item_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL,
	CONSTRAINT "catalog_item_counters_range" CHECK ("catalog_item_counters"."last_number" >= 0 and "catalog_item_counters"."last_number" <= 999999)
);
--> statement-breakpoint
ALTER TABLE "catalog_items" DROP CONSTRAINT "catalog_items_code_not_blank";--> statement-breakpoint
UPDATE "catalog_items" SET "code" = lpad("code", 6, '0') WHERE "code" ~ '^[0-9]{1,6}$' AND length("code") < 6;--> statement-breakpoint
ALTER TABLE "catalog_items" ALTER COLUMN "code" SET DATA TYPE varchar(6);--> statement-breakpoint
ALTER TABLE "catalog_item_counters" ADD CONSTRAINT "catalog_item_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_code_format" CHECK ("catalog_items"."code" ~ '^[0-9]{6}$');--> statement-breakpoint
INSERT INTO "catalog_item_counters" ("tenant_id", "last_number")
SELECT "tenant_id", MAX("code"::integer) FROM "catalog_items" GROUP BY "tenant_id";