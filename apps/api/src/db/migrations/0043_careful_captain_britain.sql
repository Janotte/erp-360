CREATE TYPE "public"."nfe_authorization_status" AS ENUM('authorized', 'denied', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."recipient_manifestation" AS ENUM('none', 'aware', 'confirmed', 'unaware', 'not_performed');--> statement-breakpoint
ALTER TYPE "public"."inbound_status" ADD VALUE 'discovered';--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD COLUMN "recipient_manifestation" "recipient_manifestation" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_documents" ADD COLUMN "authorization_status" "nfe_authorization_status" DEFAULT 'authorized' NOT NULL;