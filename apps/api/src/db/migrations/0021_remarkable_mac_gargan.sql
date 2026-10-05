CREATE TYPE "public"."bank_account_kind" AS ENUM('operating', 'investment');--> statement-breakpoint
CREATE TABLE "treasury_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"amount" integer NOT NULL,
	"from_treasury" "treasury_kind" NOT NULL,
	"from_bank_account_id" uuid,
	"to_treasury" "treasury_kind" NOT NULL,
	"to_bank_account_id" uuid,
	"description" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "treasury_transfers_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "kind" "bank_account_kind" DEFAULT 'operating' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD COLUMN "transfer_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD COLUMN "transfer_id" uuid;--> statement-breakpoint
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_from_bank_account_tenant_fk" FOREIGN KEY ("from_bank_account_id","tenant_id") REFERENCES "public"."bank_accounts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_to_bank_account_tenant_fk" FOREIGN KEY ("to_bank_account_id","tenant_id") REFERENCES "public"."bank_accounts"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD CONSTRAINT "bank_entries_transfer_id_treasury_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."treasury_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_transfer_id_treasury_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."treasury_transfers"("id") ON DELETE cascade ON UPDATE no action;