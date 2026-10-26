CREATE TYPE "public"."dfe_document_kind" AS ENUM('summary', 'nfe', 'event_summary', 'event', 'unknown');--> statement-breakpoint
CREATE TABLE "dfe_cursors" (
	"tenant_id" uuid NOT NULL,
	"environment" "nfe_environment" NOT NULL,
	"ult_nsu" varchar(15) DEFAULT '000000000000000' NOT NULL,
	"max_nsu" varchar(15) DEFAULT '000000000000000' NOT NULL,
	"last_status" varchar(3),
	"queried_at" timestamp with time zone,
	CONSTRAINT "dfe_cursors_tenant_id_environment_pk" PRIMARY KEY("tenant_id","environment"),
	CONSTRAINT "dfe_cursors_nsu_digits" CHECK ("dfe_cursors"."ult_nsu" ~ '^[0-9]{15}$' and "dfe_cursors"."max_nsu" ~ '^[0-9]{15}$'),
	CONSTRAINT "dfe_cursors_status_digits" CHECK ("dfe_cursors"."last_status" is null or "dfe_cursors"."last_status" ~ '^[0-9]{3}$')
);
--> statement-breakpoint
CREATE TABLE "dfe_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"environment" "nfe_environment" NOT NULL,
	"nsu" varchar(15) NOT NULL,
	"schema_name" varchar(60) NOT NULL,
	"kind" "dfe_document_kind" NOT NULL,
	"access_key" varchar(44),
	"xml" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dfe_documents_nsu_unique" UNIQUE("tenant_id","environment","nsu"),
	CONSTRAINT "dfe_documents_nsu_digits" CHECK ("dfe_documents"."nsu" ~ '^[0-9]{15}$'),
	CONSTRAINT "dfe_documents_access_key_digits" CHECK ("dfe_documents"."access_key" is null or "dfe_documents"."access_key" ~ '^[0-9]{44}$')
);
--> statement-breakpoint
ALTER TABLE "dfe_cursors" ADD CONSTRAINT "dfe_cursors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dfe_documents" ADD CONSTRAINT "dfe_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dfe_documents_access_key_idx" ON "dfe_documents" USING btree ("tenant_id","environment","access_key");