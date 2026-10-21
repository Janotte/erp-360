CREATE TYPE "public"."certificate_environment" AS ENUM('homologation', 'production');--> statement-breakpoint
CREATE TYPE "public"."certificate_model" AS ENUM('a1', 'a3');--> statement-breakpoint
CREATE TABLE "tenant_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"model" "certificate_model" DEFAULT 'a1' NOT NULL,
	"environment" "certificate_environment" NOT NULL,
	"label" varchar(60),
	"pfx" "bytea" NOT NULL,
	"password_cipher" "bytea" NOT NULL,
	"serial_number" varchar(40) NOT NULL,
	"thumbprint_sha256" varchar(64) NOT NULL,
	"subject_name" text NOT NULL,
	"issuer_name" text NOT NULL,
	"tax_id" varchar(14) NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_certificates_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "tenant_certificates_tax_id_digits" CHECK ("tenant_certificates"."tax_id" ~ '^[0-9]{14}$'),
	CONSTRAINT "tenant_certificates_thumbprint_hex" CHECK ("tenant_certificates"."thumbprint_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "tenant_certificates_serial_hex" CHECK ("tenant_certificates"."serial_number" ~ '^[0-9A-F]{1,40}$'),
	CONSTRAINT "tenant_certificates_label_not_blank" CHECK ("tenant_certificates"."label" is null or length(trim("tenant_certificates"."label")) > 0)
);
--> statement-breakpoint
ALTER TABLE "tenant_certificates" ADD CONSTRAINT "tenant_certificates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_certificates_one_active_per_environment" ON "tenant_certificates" USING btree ("tenant_id","environment") WHERE "tenant_certificates"."is_active";--> statement-breakpoint
CREATE INDEX "tenant_certificates_tenant_valid_until_idx" ON "tenant_certificates" USING btree ("tenant_id","valid_until");