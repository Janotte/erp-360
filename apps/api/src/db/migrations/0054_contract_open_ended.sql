ALTER TABLE "contracts" DROP CONSTRAINT "contracts_billing_check";--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_billing_check" CHECK ((
        "contracts"."billing_kind" = 'none'
        and "contracts"."period_amount" = 0
        and "contracts"."due_day" is null
        and "contracts"."billing_competence" is null
      ) or (
        "contracts"."billing_kind" <> 'none'
        and "contracts"."period_amount" > 0
        and "contracts"."due_day" between 1 and 28
        and "contracts"."billing_competence" is not null
      ));