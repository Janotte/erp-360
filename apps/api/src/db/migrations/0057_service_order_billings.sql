CREATE TABLE "service_order_billings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"service_order_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"due_on" date NOT NULL,
	"amount" integer NOT NULL,
	"receivable_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_order_billings_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "service_order_billings_tenant_order_line_unique" UNIQUE("tenant_id","service_order_id","line_number"),
	CONSTRAINT "service_order_billings_tenant_receivable_unique" UNIQUE("tenant_id","receivable_id"),
	CONSTRAINT "service_order_billings_line_check" CHECK ("service_order_billings"."line_number" >= 1),
	CONSTRAINT "service_order_billings_amount_check" CHECK ("service_order_billings"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "service_order_billings" ADD CONSTRAINT "service_order_billings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_billings" ADD CONSTRAINT "service_order_billings_order_tenant_fk" FOREIGN KEY ("service_order_id","tenant_id") REFERENCES "public"."service_orders"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_billings" ADD CONSTRAINT "service_order_billings_receivable_tenant_fk" FOREIGN KEY ("receivable_id","tenant_id") REFERENCES "public"."receivables"("id","tenant_id") ON DELETE restrict ON UPDATE no action;