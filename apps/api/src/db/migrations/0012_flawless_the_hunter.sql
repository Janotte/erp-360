CREATE TYPE "public"."type_person_contact" AS ENUM('Principal', 'Outro');--> statement-breakpoint
CREATE TABLE "person_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"type" "type_person_contact" DEFAULT 'Principal' NOT NULL,
	"department" varchar(40) NOT NULL,
	"name" varchar(60) NOT NULL,
	"phone" varchar(20),
	"mobile_phone" varchar(20),
	"email" varchar(80)
);
--> statement-breakpoint
ALTER TABLE "person_contacts" ADD CONSTRAINT "person_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_contacts" ADD CONSTRAINT "person_contacts_person_tenant_fk" FOREIGN KEY ("person_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE cascade ON UPDATE no action;