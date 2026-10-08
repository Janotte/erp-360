CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
UPDATE "persons"
SET
  "nfe_email" = lower(trim("nfe_email"))
WHERE "nfe_email" IS NOT NULL;--> statement-breakpoint
UPDATE "persons"
SET
  "document_emails" = (
    SELECT array_agg(lower(trim(email)))
    FROM unnest("document_emails") AS email
  )
WHERE "document_emails" IS NOT NULL;--> statement-breakpoint
UPDATE "persons"
SET
  "tax_id" = nullif(regexp_replace("tax_id", '\D', '', 'g'), '')
WHERE "type" IN ('individual', 'company')
  AND "tax_id" IS NOT NULL;--> statement-breakpoint
UPDATE "person_contacts"
SET
  "email" = lower(trim("email"))
WHERE "email" IS NOT NULL;--> statement-breakpoint
UPDATE "person_contacts"
SET
  "phone" = nullif(regexp_replace("phone", '\D', '', 'g'), '')
WHERE "phone" IS NOT NULL;--> statement-breakpoint
UPDATE "person_contacts"
SET
  "mobile_phone" = nullif(regexp_replace("mobile_phone", '\D', '', 'g'), '')
WHERE "mobile_phone" IS NOT NULL;--> statement-breakpoint
UPDATE "person_contacts"
SET
  "whatsapp" = nullif(regexp_replace("whatsapp", '\D', '', 'g'), '')
WHERE "whatsapp" IS NOT NULL;--> statement-breakpoint
UPDATE "person_addresses"
SET
  "postal_code" = nullif(regexp_replace("postal_code", '\D', '', 'g'), '')
WHERE "postal_code" IS NOT NULL;--> statement-breakpoint
UPDATE "users"
SET
  "email" = lower(trim("email"));--> statement-breakpoint
UPDATE "tenants"
SET
  "cnpj" = regexp_replace("cnpj", '\D', '', 'g')
WHERE "cnpj" IS NOT NULL;
