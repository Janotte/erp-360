CREATE TYPE "public"."catalog_item_type" AS ENUM('product', 'service');--> statement-breakpoint
CREATE TYPE "public"."fiscal_item_type" AS ENUM('resale', 'raw_material', 'packaging', 'work_in_process', 'finished_product', 'byproduct', 'intermediate_product', 'consumable', 'fixed_asset', 'service', 'other_input', 'other');--> statement-breakpoint
CREATE TYPE "public"."measure_type" AS ENUM('weight', 'volume', 'length', 'area', 'unit', 'time');--> statement-breakpoint
CREATE TABLE "catalog_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" varchar(80) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_categories_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "catalog_categories_sibling_name_unique" UNIQUE("tenant_id","parent_id","name"),
	CONSTRAINT "catalog_categories_name_not_blank" CHECK (length(trim("catalog_categories"."name")) > 0),
	CONSTRAINT "catalog_categories_parent_not_self" CHECK ("catalog_categories"."parent_id" is null or "catalog_categories"."parent_id" <> "catalog_categories"."id")
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(60) NOT NULL,
	"type" "catalog_item_type" NOT NULL,
	"fiscal_item_type" "fiscal_item_type" NOT NULL,
	"tracks_stock" boolean DEFAULT true NOT NULL,
	"category_id" uuid,
	"measure_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"barcode" varchar(14),
	"list_price" numeric(15, 4),
	"ncm_code" varchar(8),
	"cest_code" varchar(7),
	"net_weight_kg" numeric(12, 3),
	"gross_weight_kg" numeric(12, 3),
	"length_cm" numeric(8, 2),
	"width_cm" numeric(8, 2),
	"height_cm" numeric(8, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "catalog_items_tenant_code_unique" UNIQUE("tenant_id","code"),
	CONSTRAINT "catalog_items_tenant_barcode_unique" UNIQUE("tenant_id","barcode"),
	CONSTRAINT "catalog_items_fiscal_type_check" CHECK ((
        ("catalog_items"."type" = 'service' and "catalog_items"."fiscal_item_type" = 'service')
        or ("catalog_items"."type" = 'product' and "catalog_items"."fiscal_item_type" <> 'service')
      )),
	CONSTRAINT "catalog_items_code_not_blank" CHECK (length(trim("catalog_items"."code")) > 0),
	CONSTRAINT "catalog_items_name_not_blank" CHECK (length(trim("catalog_items"."name")) > 0),
	CONSTRAINT "catalog_items_barcode_check" CHECK ("catalog_items"."barcode" is null or "catalog_items"."barcode" ~ '^[0-9]{8}$|^[0-9]{12,14}$'),
	CONSTRAINT "catalog_items_cest_check" CHECK ("catalog_items"."cest_code" is null or "catalog_items"."cest_code" ~ '^[0-9]{7}$'),
	CONSTRAINT "catalog_items_list_price_check" CHECK ("catalog_items"."list_price" is null or "catalog_items"."list_price" >= 0),
	CONSTRAINT "catalog_items_measures_check" CHECK ((
        ("catalog_items"."net_weight_kg" is null or "catalog_items"."net_weight_kg" >= 0)
        and ("catalog_items"."gross_weight_kg" is null or "catalog_items"."gross_weight_kg" >= 0)
        and ("catalog_items"."length_cm" is null or "catalog_items"."length_cm" >= 0)
        and ("catalog_items"."width_cm" is null or "catalog_items"."width_cm" >= 0)
        and ("catalog_items"."height_cm" is null or "catalog_items"."height_cm" >= 0)
      ))
);
--> statement-breakpoint
CREATE TABLE "measures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(30) NOT NULL,
	"abbreviation" varchar(6) NOT NULL,
	"measure_type" "measure_type" NOT NULL,
	"factor" numeric(18, 6) DEFAULT '1' NOT NULL,
	"base_measure_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "measures_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "measures_tenant_name_unique" UNIQUE("tenant_id","name"),
	CONSTRAINT "measures_tenant_abbreviation_unique" UNIQUE("tenant_id","abbreviation"),
	CONSTRAINT "measures_factor_base_check" CHECK ((
        ("measures"."base_measure_id" is null and "measures"."factor" = 1)
        or ("measures"."base_measure_id" is not null and "measures"."factor" > 0)
      )),
	CONSTRAINT "measures_base_not_self" CHECK ("measures"."base_measure_id" is null or "measures"."base_measure_id" <> "measures"."id"),
	CONSTRAINT "measures_name_not_blank" CHECK (length(trim("measures"."name")) > 0),
	CONSTRAINT "measures_abbreviation_not_blank" CHECK (length(trim("measures"."abbreviation")) > 0),
	CONSTRAINT "measures_abbreviation_uppercase" CHECK ("measures"."abbreviation" = upper("measures"."abbreviation"))
);
--> statement-breakpoint
CREATE TABLE "ncms" (
	"code" varchar(8) PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ncms_code_digits" CHECK ("ncms"."code" ~ '^[0-9]{8}$'),
	CONSTRAINT "ncms_description_not_blank" CHECK (length(trim("ncms"."description")) > 0),
	CONSTRAINT "ncms_validity" CHECK ("ncms"."ends_on" is null or "ncms"."ends_on" >= "ncms"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_parent_tenant_fk" FOREIGN KEY ("parent_id","tenant_id") REFERENCES "public"."catalog_categories"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_ncm_code_ncms_code_fk" FOREIGN KEY ("ncm_code") REFERENCES "public"."ncms"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_category_tenant_fk" FOREIGN KEY ("category_id","tenant_id") REFERENCES "public"."catalog_categories"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_measure_tenant_fk" FOREIGN KEY ("measure_id","tenant_id") REFERENCES "public"."measures"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measures" ADD CONSTRAINT "measures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measures" ADD CONSTRAINT "measures_base_measure_tenant_fk" FOREIGN KEY ("base_measure_id","tenant_id") REFERENCES "public"."measures"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_categories_root_name_unique" ON "catalog_categories" USING btree ("tenant_id","name") WHERE "catalog_categories"."parent_id" is null;--> statement-breakpoint
CREATE INDEX "catalog_items_tenant_category_idx" ON "catalog_items" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE INDEX "catalog_items_tenant_measure_idx" ON "catalog_items" USING btree ("tenant_id","measure_id");--> statement-breakpoint
CREATE INDEX "catalog_items_ncm_code_idx" ON "catalog_items" USING btree ("ncm_code");