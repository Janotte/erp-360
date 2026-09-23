ALTER TABLE "tenants" ADD COLUMN "cnpj" varchar(14);
--> statement-breakpoint
UPDATE "tenants"
SET "cnpj" = substr(replace("id"::text, '-', ''), 1, 14)
WHERE "cnpj" IS NULL;
--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "cnpj" SET NOT NULL;
