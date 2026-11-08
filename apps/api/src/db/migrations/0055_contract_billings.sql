CREATE TABLE "contract_billings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"competence" date NOT NULL,
	"due_on" date NOT NULL,
	"amount" integer NOT NULL,
	"receivable_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contract_billings_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "contract_billings_tenant_contract_competence_unique" UNIQUE("tenant_id","contract_id","competence"),
	CONSTRAINT "contract_billings_tenant_receivable_unique" UNIQUE("tenant_id","receivable_id"),
	CONSTRAINT "contract_billings_amount_check" CHECK ("contract_billings"."amount" > 0),
	CONSTRAINT "contract_billings_competence_day_check" CHECK (extract(day from "contract_billings"."competence") = 1)
);
--> statement-breakpoint
ALTER TABLE "contract_billings" ADD CONSTRAINT "contract_billings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_billings" ADD CONSTRAINT "contract_billings_contract_tenant_fk" FOREIGN KEY ("contract_id","tenant_id") REFERENCES "public"."contracts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_billings" ADD CONSTRAINT "contract_billings_receivable_tenant_fk" FOREIGN KEY ("receivable_id","tenant_id") REFERENCES "public"."receivables"("id","tenant_id") ON DELETE restrict ON UPDATE no action;