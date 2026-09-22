CREATE TYPE "public"."status_financial" AS ENUM('pendente', 'pago', 'cancelado');--> statement-breakpoint
CREATE TABLE "accounts_payable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"document" varchar(20),
	"description" varchar(255) NOT NULL,
	"issue_date" date DEFAULT CURRENT_DATE NOT NULL,
	"amount" integer NOT NULL,
	"due_date" date NOT NULL,
	"payment_date" date,
	"amount_paid" integer,
	"status" "status_financial" DEFAULT 'pendente' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts_receivable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"document" varchar(20),
	"description" varchar(255) NOT NULL,
	"issue_date" date DEFAULT CURRENT_DATE NOT NULL,
	"amount" integer NOT NULL,
	"due_date" date NOT NULL,
	"payment_date" date,
	"amount_paid" integer,
	"status" "status_financial" DEFAULT 'pendente' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;