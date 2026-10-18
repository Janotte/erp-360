ALTER TABLE "ncms" DROP CONSTRAINT "ncms_code_digits";--> statement-breakpoint
ALTER TABLE "catalog_items" ALTER COLUMN "ncm_code" SET DATA TYPE varchar(10);--> statement-breakpoint
ALTER TABLE "ncms" ALTER COLUMN "code" SET DATA TYPE varchar(10);--> statement-breakpoint
UPDATE "ncms"
SET "code" = substring("code" from 1 for 4) || '.' || substring("code" from 5 for 2) || '.' || substring("code" from 7 for 2)
WHERE "code" ~ '^[0-9]{8}$';--> statement-breakpoint
ALTER TABLE "ncms" ADD CONSTRAINT "ncms_code_format" CHECK ("ncms"."code" ~ '^[0-9]{4}[.][0-9]{2}[.][0-9]{2}$');