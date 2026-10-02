CREATE TYPE "public"."type_person" AS ENUM('individual', 'company', 'foreigner');--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "type" "type_person" DEFAULT 'individual' NOT NULL;