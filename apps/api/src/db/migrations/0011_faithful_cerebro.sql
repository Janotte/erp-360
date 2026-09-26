CREATE TYPE "public"."type_person_address" AS ENUM('Principal', 'Faturamento', 'Entrega', 'Outro');--> statement-breakpoint
CREATE TABLE "person_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"type" "type_person_address" DEFAULT 'Principal' NOT NULL,
	"postal_code" varchar(9),
	"street" varchar(60),
	"number" varchar(10),
	"complement" varchar(30),
	"neighborhood" varchar(50),
	"city_id" uuid
);
--> statement-breakpoint
ALTER TABLE "person_addresses" ADD CONSTRAINT "person_addresses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_addresses" ADD CONSTRAINT "person_addresses_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_id_tenant_id_unique" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "person_addresses" ADD CONSTRAINT "person_addresses_person_tenant_fk" FOREIGN KEY ("person_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE cascade ON UPDATE no action;