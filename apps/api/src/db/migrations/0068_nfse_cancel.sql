ALTER TABLE "nfse_requests" DROP CONSTRAINT "nfse_requests_tenant_document_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "nfse_requests_tenant_document_live_unique" ON "nfse_requests" USING btree ("tenant_id","billing_document_id") WHERE "nfse_requests"."status" in ('pending', 'rejected', 'authorized');--> statement-breakpoint
CREATE TABLE "nfse_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"type" varchar(16) NOT NULL,
	"sequence" integer NOT NULL,
	"reason_code" varchar(1),
	"reason_text" text,
	"event_xml" text NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nfse_events_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "nfse_events_request_type_sequence_unique" UNIQUE("tenant_id","request_id","type","sequence"),
	CONSTRAINT "nfse_events_type_check" CHECK ("nfse_events"."type" ~ '^[a-z][a-z0-9]{0,15}$'),
	CONSTRAINT "nfse_events_sequence_check" CHECK ("nfse_events"."sequence" between 1 and 999),
	CONSTRAINT "nfse_events_reason_code_check" CHECK ("nfse_events"."reason_code" is null or "nfse_events"."reason_code" in ('1', '2', '9')),
	CONSTRAINT "nfse_events_reason_text_check" CHECK ("nfse_events"."reason_text" is null or (
        length(trim("nfse_events"."reason_text")) >= 15 and length("nfse_events"."reason_text") <= 255
      )),
	CONSTRAINT "nfse_events_event_xml_check" CHECK (length(trim("nfse_events"."event_xml")) > 0 and length("nfse_events"."event_xml") <= 500000)
);
--> statement-breakpoint
ALTER TABLE "nfse_events" ADD CONSTRAINT "nfse_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfse_events" ADD CONSTRAINT "nfse_events_request_tenant_fk" FOREIGN KEY ("request_id","tenant_id") REFERENCES "public"."nfse_requests"("id","tenant_id") ON DELETE cascade ON UPDATE no action;
