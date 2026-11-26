ALTER TABLE "nfse_settings" ADD COLUMN "simples_tax_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "nfse_settings" ADD CONSTRAINT "nfse_settings_simples_tax_percent_check" CHECK ("nfse_settings"."simples_tax_percent" is null or (
        "nfse_settings"."simples_tax_percent" >= 0 and "nfse_settings"."simples_tax_percent" <= 100
      ));--> statement-breakpoint
ALTER TABLE "nfse_settings" ADD CONSTRAINT "nfse_settings_simples_tax_percent_regime_check" CHECK (
        "nfse_settings"."simples_nacional" in ('me_epp', 'pending')
        or (
          "nfse_settings"."simples_nacional" in ('non_optant', 'mei')
          and "nfse_settings"."simples_tax_percent" is null
        )
      );
