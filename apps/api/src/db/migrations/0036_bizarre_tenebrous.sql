CREATE TYPE "public"."tenant_crt" AS ENUM('1', '2', '3', '4');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'inactive', 'suspended', 'archived');--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "name" SET DATA TYPE varchar(60) USING left("name", 60);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "trade_name" varchar(60);--> statement-breakpoint
UPDATE "tenants" SET "trade_name" = "name" WHERE "trade_name" IS NULL;--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "trade_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "state_registration" varchar(14);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "municipal_registration" varchar(15);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "cnae" varchar(7);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "email" varchar(80);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "phone" varchar(14);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "crt" "tenant_crt" DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "status" "tenant_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "postal_code" varchar(8);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "street" varchar(60);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "number" varchar(60);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "complement" varchar(60);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "neighborhood" varchar(60);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "city_id" uuid;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;
