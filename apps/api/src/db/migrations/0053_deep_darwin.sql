CREATE TYPE "public"."contract_billing_competence" AS ENUM('current', 'previous');--> statement-breakpoint
CREATE TYPE "public"."contract_billing_kind" AS ENUM('none', 'monthly', 'quarterly', 'semiannual', 'annual');--> statement-breakpoint
CREATE TYPE "public"."contract_event_kind" AS ENUM('status', 'billing');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'active', 'suspended', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "contract_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "contract_counters_last_number_check" CHECK ("contract_counters"."last_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contract_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"kind" "contract_event_kind" NOT NULL,
	"from_status" "contract_status",
	"to_status" "contract_status" NOT NULL,
	"billing_kind" "contract_billing_kind" NOT NULL,
	"billing_competence" "contract_billing_competence",
	"period_amount" integer NOT NULL,
	"due_day" smallint,
	"reason" varchar(200),
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contract_events_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "contract_events_period_amount_check" CHECK ("contract_events"."period_amount" >= 0),
	CONSTRAINT "contract_events_due_day_check" CHECK ("contract_events"."due_day" is null or "contract_events"."due_day" between 1 and 28),
	CONSTRAINT "contract_events_from_status_check" CHECK (("contract_events"."from_status" is null) = ("contract_events"."kind" = 'status' and "contract_events"."to_status" = 'draft'))
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"person_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"billing_kind" "contract_billing_kind" DEFAULT 'none' NOT NULL,
	"billing_competence" "contract_billing_competence",
	"period_amount" integer DEFAULT 0 NOT NULL,
	"due_day" smallint,
	"payment_method_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"suspension_reason" varchar(200),
	"closed_on" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "contracts_tenant_number_unique" UNIQUE("tenant_id","number"),
	CONSTRAINT "contracts_number_check" CHECK ("contracts"."number" > 0),
	CONSTRAINT "contracts_title_check" CHECK (length(trim("contracts"."title")) > 0),
	CONSTRAINT "contracts_ended_on_check" CHECK ("contracts"."ended_on" is null or "contracts"."ended_on" >= "contracts"."started_on"),
	CONSTRAINT "contracts_billing_check" CHECK ((
        "contracts"."billing_kind" = 'none'
        and "contracts"."period_amount" = 0
        and "contracts"."due_day" is null
        and "contracts"."billing_competence" is null
      ) or (
        "contracts"."billing_kind" <> 'none'
        and "contracts"."period_amount" > 0
        and "contracts"."due_day" between 1 and 28
        and "contracts"."ended_on" is not null
        and "contracts"."billing_competence" is not null
      )),
	CONSTRAINT "contracts_suspension_reason_check" CHECK ((
        "contracts"."status" = 'suspended'
        and "contracts"."suspension_reason" is not null
        and length(trim("contracts"."suspension_reason")) > 0
      ) or (
        "contracts"."status" <> 'suspended'
        and "contracts"."suspension_reason" is null
      )),
	CONSTRAINT "contracts_closed_on_check" CHECK (("contracts"."status" = 'closed') = ("contracts"."closed_on" is not null))
);
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN "contract_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_counters" ADD CONSTRAINT "contract_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_contract_tenant_fk" FOREIGN KEY ("contract_id","tenant_id") REFERENCES "public"."contracts"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_actor_tenant_fk" FOREIGN KEY ("actor_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_person_tenant_fk" FOREIGN KEY ("person_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_payment_method_tenant_fk" FOREIGN KEY ("payment_method_id","tenant_id") REFERENCES "public"."payment_methods"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_contract_tenant_fk" FOREIGN KEY ("contract_id","tenant_id") REFERENCES "public"."contracts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_contract_attendance_check" CHECK ("service_orders"."contract_id" is null or "service_orders"."attendance" = 'contract');