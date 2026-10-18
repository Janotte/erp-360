ALTER TABLE "measures" DROP CONSTRAINT "measures_factor_base_check";--> statement-breakpoint
ALTER TABLE "measures" DROP CONSTRAINT "measures_base_not_self";--> statement-breakpoint
ALTER TABLE "measures" DROP CONSTRAINT "measures_base_measure_tenant_fk";
--> statement-breakpoint
ALTER TABLE "measures" DROP COLUMN "factor";--> statement-breakpoint
ALTER TABLE "measures" DROP COLUMN "base_measure_id";