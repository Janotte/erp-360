CREATE TYPE "public"."type_person_address" AS ENUM('Principal', 'Faturamento', 'Entrega', 'Outro');--> statement-breakpoint
CREATE TYPE "public"."type_person_contact" AS ENUM('Principal', 'Outro');--> statement-breakpoint
CREATE TABLE "person_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"type" "type_person_address" DEFAULT 'Principal' NOT NULL,
	"postal_code" varchar(9),
	"street" varchar(60),
	"number" varchar(60),
	"complement" varchar(60),
	"neighborhood" varchar(60),
	"city_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"code" varchar(7) NOT NULL,
	"state_id" uuid NOT NULL,
	"is_capital" boolean DEFAULT false NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"population" integer,
	"timezone" varchar(70),
	CONSTRAINT "cities_state_name_unique" UNIQUE("state_id","name"),
	CONSTRAINT "cities_state_code_unique" UNIQUE("state_id","code")
);
--> statement-breakpoint
CREATE TABLE "person_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"type" "type_person_contact" DEFAULT 'Principal' NOT NULL,
	"relationship" varchar(40),
	"name" varchar(60) NOT NULL,
	"email" varchar(80),
	"phone" varchar(20),
	"mobile_phone" varchar(20),
	"whatsapp" varchar(20)
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"code" varchar(4) NOT NULL,
	CONSTRAINT "countries_name_unique" UNIQUE("name"),
	CONSTRAINT "countries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"tax_id" varchar(19),
	"taxpayer_type" smallint,
	"state_registration" varchar(20),
	"is_rural_producer" boolean DEFAULT false NOT NULL,
	"birth_date" date,
	"nfe_email" varchar(60),
	"document_emails" text[],
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"photo" text,
	"is_client" boolean DEFAULT false NOT NULL,
	"is_supplier" boolean DEFAULT false NOT NULL,
	"is_employee" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "persons_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "persons_tenant_tax_id_unique" UNIQUE("tenant_id","tax_id"),
	CONSTRAINT "persons_taxpayer_type_check" CHECK ("persons"."taxpayer_type" in (1, 2, 9))
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"abbreviation" varchar(2) NOT NULL,
	"code" varchar(2) NOT NULL,
	"region" varchar(20) NOT NULL,
	"country_id" uuid NOT NULL,
	CONSTRAINT "states_country_name_unique" UNIQUE("country_id","name"),
	CONSTRAINT "states_country_code_unique" UNIQUE("country_id","code"),
	CONSTRAINT "states_country_abbreviation_unique" UNIQUE("country_id","abbreviation")
);
--> statement-breakpoint
ALTER TABLE "person_addresses" ADD CONSTRAINT "person_addresses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_addresses" ADD CONSTRAINT "person_addresses_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_addresses" ADD CONSTRAINT "person_addresses_person_tenant_fk" FOREIGN KEY ("person_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_contacts" ADD CONSTRAINT "person_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_contacts" ADD CONSTRAINT "person_contacts_person_tenant_fk" FOREIGN KEY ("person_id","tenant_id") REFERENCES "public"."persons"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "states" ADD CONSTRAINT "states_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_addresses_role_per_person" ON "person_addresses" USING btree ("tenant_id","person_id","type") WHERE "person_addresses"."type" <> 'Outro';--> statement-breakpoint
CREATE UNIQUE INDEX "cities_one_capital_per_state" ON "cities" USING btree ("state_id") WHERE "cities"."is_capital" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "person_contacts_one_principal" ON "person_contacts" USING btree ("tenant_id","person_id") WHERE "person_contacts"."type" = 'Principal';