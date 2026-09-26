CREATE TABLE "states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"abbreviation" varchar(2) NOT NULL,
	"code" varchar(2) NOT NULL,
	"region" varchar(20) NOT NULL,
	"country_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "states" ADD CONSTRAINT "states_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;