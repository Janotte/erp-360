CREATE TABLE "payment_plan_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"method_name" varchar(60) NOT NULL,
	"due_on" date NOT NULL,
	"amount" integer NOT NULL,
	"installment_count" integer NOT NULL,
	"means_of_payment_id" uuid NOT NULL,
	"interest_type" "payment_interest_type" NOT NULL,
	"interest_rate_bps" integer NOT NULL,
	"administrative_fee_bps" integer NOT NULL,
	"fixed_fee_amount" integer NOT NULL,
	"first_due_days" integer NOT NULL,
	"interval_days" integer NOT NULL,
	"receipt_kind" "payment_receipt_kind" NOT NULL,
	"integration_type" "payment_integration_type",
	"acquirer_id" uuid,
	"card_brand_id" uuid,
	CONSTRAINT "payment_plan_lines_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "payment_plan_lines_plan_line_unique" UNIQUE("tenant_id","plan_id","line_number"),
	CONSTRAINT "payment_plan_lines_amount_check" CHECK ("payment_plan_lines"."amount" >= 0),
	CONSTRAINT "payment_plan_lines_number_check" CHECK ("payment_plan_lines"."line_number" >= 1),
	CONSTRAINT "payment_plan_lines_count_check" CHECK ("payment_plan_lines"."installment_count" between 1 and 48)
);
--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "payment_plans_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "payment_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_plan_lines" ADD CONSTRAINT "payment_plan_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan_lines" ADD CONSTRAINT "payment_plan_lines_means_of_payment_id_means_of_payment_id_fk" FOREIGN KEY ("means_of_payment_id") REFERENCES "public"."means_of_payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan_lines" ADD CONSTRAINT "payment_plan_lines_card_brand_id_card_brands_id_fk" FOREIGN KEY ("card_brand_id") REFERENCES "public"."card_brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan_lines" ADD CONSTRAINT "payment_plan_lines_plan_tenant_fk" FOREIGN KEY ("plan_id","tenant_id") REFERENCES "public"."payment_plans"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan_lines" ADD CONSTRAINT "payment_plan_lines_method_tenant_fk" FOREIGN KEY ("payment_method_id","tenant_id") REFERENCES "public"."payment_methods"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan_lines" ADD CONSTRAINT "payment_plan_lines_acquirer_tenant_fk" FOREIGN KEY ("acquirer_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_payment_plan_tenant_fk" FOREIGN KEY ("payment_plan_id","tenant_id") REFERENCES "public"."payment_plans"("id","tenant_id") ON DELETE restrict ON UPDATE no action;