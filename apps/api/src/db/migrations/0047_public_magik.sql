CREATE TYPE "public"."service_order_attendance" AS ENUM('walk_in', 'warranty', 'rework', 'contract');--> statement-breakpoint
CREATE TYPE "public"."service_order_line_kind" AS ENUM('product', 'service');--> statement-breakpoint
CREATE TYPE "public"."service_order_status" AS ENUM('open', 'analyzing', 'waiting_approval', 'waiting_parts', 'in_progress', 'ready', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TABLE "service_order_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "service_order_counters_last_number_check" CHECK ("service_order_counters"."last_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_order_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"slot" varchar(7) NOT NULL,
	"value" varchar(2000),
	"label" varchar(60),
	"width" smallint,
	"is_active" boolean,
	CONSTRAINT "service_order_field_values_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "service_order_field_values_order_slot_unique" UNIQUE("tenant_id","order_id","slot"),
	CONSTRAINT "service_order_field_values_slot_check" CHECK ("service_order_field_values"."slot" ~ '^field(0[1-9]|1[01])$'),
	CONSTRAINT "service_order_field_values_short_value_check" CHECK ("service_order_field_values"."value" is null or "service_order_field_values"."slot" ~ '^field(08|09|10|11)$' or length("service_order_field_values"."value") <= 120),
	CONSTRAINT "service_order_field_values_width_check" CHECK ("service_order_field_values"."width" is null or "service_order_field_values"."width" in (4, 6, 12)),
	CONSTRAINT "service_order_field_values_freeze_check" CHECK ((
        "service_order_field_values"."label" is null and "service_order_field_values"."width" is null and "service_order_field_values"."is_active" is null
      ) or (
        "service_order_field_values"."label" is not null
        and length(trim("service_order_field_values"."label")) > 0
        and "service_order_field_values"."width" is not null
        and "service_order_field_values"."is_active" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "service_order_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slot" varchar(7) NOT NULL,
	"label" varchar(60) NOT NULL,
	"is_active" boolean NOT NULL,
	"is_required" boolean NOT NULL,
	"width" smallint NOT NULL,
	CONSTRAINT "service_order_fields_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "service_order_fields_tenant_slot_unique" UNIQUE("tenant_id","slot"),
	CONSTRAINT "service_order_fields_slot_check" CHECK ("service_order_fields"."slot" ~ '^field(0[1-9]|1[01])$'),
	CONSTRAINT "service_order_fields_width_check" CHECK ("service_order_fields"."width" in (4, 6, 12)),
	CONSTRAINT "service_order_fields_active_label_check" CHECK ("service_order_fields"."is_active" = false or length(trim("service_order_fields"."label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "service_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"kind" "service_order_line_kind" NOT NULL,
	"item_id" uuid NOT NULL,
	"code" varchar(6) NOT NULL,
	"description" varchar(120) NOT NULL,
	"quantity" numeric(15, 4) NOT NULL,
	"unit_price" numeric(15, 4) NOT NULL,
	"line_amount" integer NOT NULL,
	"technician_person_id" uuid,
	"technician_name" varchar(120),
	CONSTRAINT "service_order_lines_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "service_order_lines_order_number_unique" UNIQUE("tenant_id","order_id","line_number"),
	CONSTRAINT "service_order_lines_number_check" CHECK ("service_order_lines"."line_number" >= 1),
	CONSTRAINT "service_order_lines_code_check" CHECK ("service_order_lines"."code" ~ '^[0-9]{6}$'),
	CONSTRAINT "service_order_lines_description_check" CHECK (length(trim("service_order_lines"."description")) > 0),
	CONSTRAINT "service_order_lines_quantity_check" CHECK ("service_order_lines"."quantity" > 0),
	CONSTRAINT "service_order_lines_unit_price_check" CHECK ("service_order_lines"."unit_price" >= 0),
	CONSTRAINT "service_order_lines_amount_check" CHECK ("service_order_lines"."line_amount" >= 0),
	CONSTRAINT "service_order_lines_technician_check" CHECK ((
        "service_order_lines"."kind" = 'service'
        or ("service_order_lines"."technician_person_id" is null and "service_order_lines"."technician_name" is null)
      ) and (
        ("service_order_lines"."technician_person_id" is null) = ("service_order_lines"."technician_name" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "service_order_note_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slot" varchar(6) NOT NULL,
	"body" varchar(500) NOT NULL,
	"is_active" boolean NOT NULL,
	CONSTRAINT "service_order_note_lines_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "service_order_note_lines_tenant_slot_unique" UNIQUE("tenant_id","slot"),
	CONSTRAINT "service_order_note_lines_slot_check" CHECK ("service_order_note_lines"."slot" ~ '^line0[1-5]$')
);
--> statement-breakpoint
CREATE TABLE "service_order_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"slot" varchar(6) NOT NULL,
	"body" varchar(500) NOT NULL,
	CONSTRAINT "service_order_notes_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "service_order_notes_order_slot_unique" UNIQUE("tenant_id","order_id","slot"),
	CONSTRAINT "service_order_notes_slot_check" CHECK ("service_order_notes"."slot" ~ '^line0[1-5]$')
);
--> statement-breakpoint
CREATE TABLE "service_order_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"section_title" varchar(60) NOT NULL,
	"products_title" varchar(60) NOT NULL,
	"services_title" varchar(60) NOT NULL,
	"technician_signature_label" varchar(60) NOT NULL,
	"customer_signature_label" varchar(60) NOT NULL,
	"summary_slot" varchar(7) NOT NULL,
	CONSTRAINT "service_order_settings_section_title_check" CHECK (length(trim("service_order_settings"."section_title")) > 0),
	CONSTRAINT "service_order_settings_products_title_check" CHECK (length(trim("service_order_settings"."products_title")) > 0),
	CONSTRAINT "service_order_settings_services_title_check" CHECK (length(trim("service_order_settings"."services_title")) > 0),
	CONSTRAINT "service_order_settings_technician_signature_check" CHECK (length(trim("service_order_settings"."technician_signature_label")) > 0),
	CONSTRAINT "service_order_settings_customer_signature_check" CHECK (length(trim("service_order_settings"."customer_signature_label")) > 0),
	CONSTRAINT "service_order_settings_summary_slot_check" CHECK ("service_order_settings"."summary_slot" ~ '^field(0[1-9]|1[01])$')
);
--> statement-breakpoint
CREATE TABLE "service_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "service_order_status" DEFAULT 'open' NOT NULL,
	"attendance" "service_order_attendance" DEFAULT 'walk_in' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promised_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_by_user_id" uuid NOT NULL,
	"origin_order_id" uuid,
	"person_id" uuid NOT NULL,
	"customer_name" varchar(120) NOT NULL,
	"customer_tax_id" varchar(19),
	"customer_phone" varchar(20),
	"customer_mobile_phone" varchar(20),
	"customer_whatsapp" varchar(20),
	"customer_email" varchar(80),
	"customer_street_line" varchar(200),
	"customer_neighborhood" varchar(60),
	"customer_city_line" varchar(80),
	"internal_notes" text DEFAULT '' NOT NULL,
	"freight_amount" integer DEFAULT 0 NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"surcharge_amount" integer DEFAULT 0 NOT NULL,
	"products_amount" integer DEFAULT 0 NOT NULL,
	"services_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"payment_method_id" uuid,
	"payment_installments" integer,
	"means_of_payment_id" uuid,
	"interest_type" "payment_interest_type",
	"interest_rate_bps" integer,
	"administrative_fee_bps" integer,
	"fixed_fee_amount" integer,
	"first_due_days" integer,
	"interval_days" integer,
	"receipt_kind" "payment_receipt_kind",
	"integration_type" "payment_integration_type",
	"acquirer_id" uuid,
	"card_brand_id" uuid,
	"label_frozen_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_orders_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "service_orders_tenant_number_unique" UNIQUE("tenant_id","number"),
	CONSTRAINT "service_orders_number_check" CHECK ("service_orders"."number" > 0),
	CONSTRAINT "service_orders_freight_check" CHECK ("service_orders"."freight_amount" >= 0),
	CONSTRAINT "service_orders_discount_check" CHECK ("service_orders"."discount_amount" >= 0),
	CONSTRAINT "service_orders_surcharge_check" CHECK ("service_orders"."surcharge_amount" >= 0),
	CONSTRAINT "service_orders_products_check" CHECK ("service_orders"."products_amount" >= 0),
	CONSTRAINT "service_orders_services_check" CHECK ("service_orders"."services_amount" >= 0),
	CONSTRAINT "service_orders_total_check" CHECK ("service_orders"."total_amount" >= 0),
	CONSTRAINT "service_orders_total_formula_check" CHECK ("service_orders"."total_amount" = "service_orders"."products_amount" + "service_orders"."services_amount" + "service_orders"."freight_amount" - "service_orders"."discount_amount" + "service_orders"."surcharge_amount"),
	CONSTRAINT "service_orders_installments_check" CHECK ("service_orders"."payment_installments" is null or "service_orders"."payment_installments" between 1 and 48),
	CONSTRAINT "service_orders_origin_attendance_check" CHECK ("service_orders"."origin_order_id" is null or "service_orders"."attendance" in ('warranty', 'rework')),
	CONSTRAINT "service_orders_origin_not_self_check" CHECK ("service_orders"."origin_order_id" is null or "service_orders"."origin_order_id" <> "service_orders"."id"),
	CONSTRAINT "service_orders_delivered_at_check" CHECK (("service_orders"."status" = 'delivered') = ("service_orders"."delivered_at" is not null)),
	CONSTRAINT "service_orders_label_frozen_check" CHECK (("service_orders"."status" in ('delivered', 'cancelled')) = ("service_orders"."label_frozen_at" is not null)),
	CONSTRAINT "service_orders_payment_copy_check" CHECK ((
        "service_orders"."payment_method_id" is null
        and "service_orders"."payment_installments" is null
        and "service_orders"."means_of_payment_id" is null
        and "service_orders"."interest_type" is null
        and "service_orders"."interest_rate_bps" is null
        and "service_orders"."administrative_fee_bps" is null
        and "service_orders"."fixed_fee_amount" is null
        and "service_orders"."first_due_days" is null
        and "service_orders"."interval_days" is null
        and "service_orders"."receipt_kind" is null
        and "service_orders"."integration_type" is null
        and "service_orders"."acquirer_id" is null
        and "service_orders"."card_brand_id" is null
      ) or (
        "service_orders"."payment_method_id" is not null
        and "service_orders"."payment_installments" is not null
        and "service_orders"."means_of_payment_id" is not null
        and "service_orders"."interest_type" is not null
        and "service_orders"."interest_rate_bps" is not null
        and "service_orders"."administrative_fee_bps" is not null
        and "service_orders"."fixed_fee_amount" is not null
        and "service_orders"."first_due_days" is not null
        and "service_orders"."interval_days" is not null
        and "service_orders"."receipt_kind" is not null
      )),
	CONSTRAINT "service_orders_payment_amounts_check" CHECK ((
        "service_orders"."interest_rate_bps" is null or "service_orders"."interest_rate_bps" >= 0
      ) and (
        "service_orders"."administrative_fee_bps" is null or "service_orders"."administrative_fee_bps" >= 0
      ) and (
        "service_orders"."fixed_fee_amount" is null or "service_orders"."fixed_fee_amount" >= 0
      ) and (
        "service_orders"."first_due_days" is null or "service_orders"."first_due_days" >= 0
      ) and (
        "service_orders"."interval_days" is null or "service_orders"."interval_days" >= 0
      ))
);
--> statement-breakpoint
ALTER TABLE "service_order_counters" ADD CONSTRAINT "service_order_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_field_values" ADD CONSTRAINT "service_order_field_values_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_field_values" ADD CONSTRAINT "service_order_field_values_order_tenant_fk" FOREIGN KEY ("order_id","tenant_id") REFERENCES "public"."service_orders"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_fields" ADD CONSTRAINT "service_order_fields_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_lines" ADD CONSTRAINT "service_order_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_lines" ADD CONSTRAINT "service_order_lines_order_tenant_fk" FOREIGN KEY ("order_id","tenant_id") REFERENCES "public"."service_orders"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_lines" ADD CONSTRAINT "service_order_lines_item_tenant_fk" FOREIGN KEY ("item_id","tenant_id") REFERENCES "public"."catalog_items"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_lines" ADD CONSTRAINT "service_order_lines_technician_tenant_fk" FOREIGN KEY ("technician_person_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_note_lines" ADD CONSTRAINT "service_order_note_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_notes" ADD CONSTRAINT "service_order_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_notes" ADD CONSTRAINT "service_order_notes_order_tenant_fk" FOREIGN KEY ("order_id","tenant_id") REFERENCES "public"."service_orders"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_settings" ADD CONSTRAINT "service_order_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_tenant_id_unique" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_means_of_payment_id_means_of_payment_id_fk" FOREIGN KEY ("means_of_payment_id") REFERENCES "public"."means_of_payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_card_brand_id_card_brands_id_fk" FOREIGN KEY ("card_brand_id") REFERENCES "public"."card_brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_opened_by_tenant_fk" FOREIGN KEY ("opened_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_person_tenant_fk" FOREIGN KEY ("person_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_origin_tenant_fk" FOREIGN KEY ("origin_order_id","tenant_id") REFERENCES "public"."service_orders"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_payment_method_tenant_fk" FOREIGN KEY ("payment_method_id","tenant_id") REFERENCES "public"."payment_methods"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_acquirer_tenant_fk" FOREIGN KEY ("acquirer_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;