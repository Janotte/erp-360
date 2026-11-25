CREATE TYPE "public"."nfse_request_status" AS ENUM('pending', 'authorized', 'rejected', 'canceled');--> statement-breakpoint
CREATE TABLE "nfse_request_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"description" text NOT NULL,
	"national_service_code" varchar(6),
	"municipal_service_code" varchar(3),
	"iss_rate" numeric(3, 2),
	"amount" integer NOT NULL,
	CONSTRAINT "nfse_request_lines_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "nfse_request_lines_request_number_unique" UNIQUE("tenant_id","request_id","line_number"),
	CONSTRAINT "nfse_request_lines_number_check" CHECK ("nfse_request_lines"."line_number" >= 1),
	CONSTRAINT "nfse_request_lines_amount_check" CHECK ("nfse_request_lines"."amount" > 0),
	CONSTRAINT "nfse_request_lines_description_check" CHECK ((
        length(trim("nfse_request_lines"."description")) > 0
        and length("nfse_request_lines"."description") <= 2000
        and "nfse_request_lines"."description" = upper("nfse_request_lines"."description")
      )),
	CONSTRAINT "nfse_request_lines_national_code_check" CHECK ("nfse_request_lines"."national_service_code" is null or "nfse_request_lines"."national_service_code" ~ '^[0-9]{6}$'),
	CONSTRAINT "nfse_request_lines_municipal_code_check" CHECK ("nfse_request_lines"."municipal_service_code" is null or "nfse_request_lines"."municipal_service_code" ~ '^[0-9]{3}$'),
	CONSTRAINT "nfse_request_lines_iss_rate_check" CHECK ("nfse_request_lines"."iss_rate" is null or ("nfse_request_lines"."iss_rate" >= 0 and "nfse_request_lines"."iss_rate" < 10))
);
--> statement-breakpoint
CREATE TABLE "nfse_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"billing_document_id" uuid NOT NULL,
	"status" "nfse_request_status" DEFAULT 'pending' NOT NULL,
	"service_amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nfse_requests_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "nfse_requests_tenant_document_unique" UNIQUE("tenant_id","billing_document_id"),
	CONSTRAINT "nfse_requests_service_amount_check" CHECK ("nfse_requests"."service_amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "nfse_request_lines" ADD CONSTRAINT "nfse_request_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfse_request_lines" ADD CONSTRAINT "nfse_request_lines_request_tenant_fk" FOREIGN KEY ("request_id","tenant_id") REFERENCES "public"."nfse_requests"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD CONSTRAINT "nfse_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD CONSTRAINT "nfse_requests_document_tenant_fk" FOREIGN KEY ("billing_document_id","tenant_id") REFERENCES "public"."billing_documents"("id","tenant_id") ON DELETE restrict ON UPDATE no action;