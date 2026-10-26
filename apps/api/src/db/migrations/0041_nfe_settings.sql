CREATE TYPE "public"."nfe_environment" AS ENUM('homologation', 'production');--> statement-breakpoint
CREATE TABLE "nfe_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"environment" "nfe_environment" DEFAULT 'homologation' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nfe_settings" ADD CONSTRAINT "nfe_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;