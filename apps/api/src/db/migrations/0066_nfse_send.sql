CREATE TABLE "nfse_dps_counters" (
	"tenant_id" uuid NOT NULL,
	"series" varchar(5) NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "nfse_dps_counters_tenant_id_series_pk" PRIMARY KEY("tenant_id","series"),
	CONSTRAINT "nfse_dps_counters_series_check" CHECK ("nfse_dps_counters"."series" ~ '^[0-9]{5}$' and "nfse_dps_counters"."series"::integer between 1 and 49999),
	CONSTRAINT "nfse_dps_counters_last_number_check" CHECK ("nfse_dps_counters"."last_number" >= 0)
);
--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD COLUMN "series" varchar(5);--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD COLUMN "dps_number" integer;--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD COLUMN "dps_id" varchar(45);--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD COLUMN "access_key" varchar(50);--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD COLUMN "environment" "nfse_environment";--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD COLUMN "status_message" text;--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD COLUMN "nfse_xml" text;--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nfse_settings" ADD COLUMN "series" varchar(5);--> statement-breakpoint
ALTER TABLE "nfse_dps_counters" ADD CONSTRAINT "nfse_dps_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nfse_requests_series_number_unique" ON "nfse_requests" USING btree ("tenant_id","series","dps_number") WHERE "nfse_requests"."dps_number" is not null;--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD CONSTRAINT "nfse_requests_series_check" CHECK ("nfse_requests"."series" is null or (
        "nfse_requests"."series" ~ '^[0-9]{5}$' and "nfse_requests"."series"::integer between 1 and 49999
      ));--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD CONSTRAINT "nfse_requests_dps_number_check" CHECK ("nfse_requests"."dps_number" is null or "nfse_requests"."dps_number" > 0);--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD CONSTRAINT "nfse_requests_dps_id_check" CHECK ("nfse_requests"."dps_id" is null or "nfse_requests"."dps_id" ~ '^DPS[0-9]{42}$');--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD CONSTRAINT "nfse_requests_access_key_check" CHECK ("nfse_requests"."access_key" is null or "nfse_requests"."access_key" ~ '^[0-9]{50}$');--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD CONSTRAINT "nfse_requests_identity_check" CHECK ("nfse_requests"."dps_number" is null or (
        "nfse_requests"."series" is not null and "nfse_requests"."dps_id" is not null and "nfse_requests"."environment" is not null
      ));--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD CONSTRAINT "nfse_requests_status_message_check" CHECK ("nfse_requests"."status_message" is null or (
        length(trim("nfse_requests"."status_message")) > 0 and length("nfse_requests"."status_message") <= 2000
      ));--> statement-breakpoint
ALTER TABLE "nfse_settings" ADD CONSTRAINT "nfse_settings_series_check" CHECK ("nfse_settings"."series" is null or (
        "nfse_settings"."series" ~ '^[0-9]{5}$'
        and "nfse_settings"."series"::integer between 1 and 49999
      ));