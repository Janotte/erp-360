CREATE TYPE "public"."nfse_environment" AS ENUM('homologation', 'production');--> statement-breakpoint
CREATE TYPE "public"."nfse_ibs_cbs_assessment" AS ENUM('both_by_simples', 'cbs_by_simples', 'both_regular');--> statement-breakpoint
CREATE TYPE "public"."nfse_issqn_taxation" AS ENUM('taxable', 'immunity', 'export', 'non_incidence');--> statement-breakpoint
CREATE TYPE "public"."nfse_simples_assessment" AS ENUM('federal_and_municipal', 'federal_by_simples', 'outside_simples');--> statement-breakpoint
CREATE TYPE "public"."nfse_simples_nacional" AS ENUM('non_optant', 'mei', 'me_epp', 'pending');--> statement-breakpoint
CREATE TYPE "public"."nfse_special_tax_regime" AS ENUM('none', 'cooperative_act', 'estimate', 'municipal_microenterprise', 'notary', 'self_employed', 'professionals_society', 'other');--> statement-breakpoint
CREATE TABLE "nfse_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"environment" "nfse_environment" DEFAULT 'homologation' NOT NULL,
	"simples_nacional" "nfse_simples_nacional" DEFAULT 'non_optant' NOT NULL,
	"simples_assessment" "nfse_simples_assessment",
	"ibs_cbs_assessment" "nfse_ibs_cbs_assessment",
	"special_tax_regime" "nfse_special_tax_regime" DEFAULT 'none' NOT NULL,
	"issqn_taxation" "nfse_issqn_taxation" DEFAULT 'taxable' NOT NULL,
	CONSTRAINT "nfse_settings_simples_assessment_check" CHECK ((
        ("nfse_settings"."simples_nacional" in ('me_epp', 'pending') and "nfse_settings"."simples_assessment" is not null)
        or ("nfse_settings"."simples_nacional" in ('non_optant', 'mei') and "nfse_settings"."simples_assessment" is null)
      )),
	CONSTRAINT "nfse_settings_ibs_cbs_assessment_check" CHECK ((
        ("nfse_settings"."simples_nacional" in ('me_epp', 'pending') and "nfse_settings"."ibs_cbs_assessment" is not null)
        or ("nfse_settings"."simples_nacional" in ('non_optant', 'mei') and "nfse_settings"."ibs_cbs_assessment" is null)
      )),
	CONSTRAINT "nfse_settings_special_regime_check" CHECK ((
        "nfse_settings"."special_tax_regime" = 'none'
        or (
          "nfse_settings"."simples_nacional" <> 'mei'
          and not (
            "nfse_settings"."simples_nacional" = 'me_epp'
            and "nfse_settings"."simples_assessment" = 'federal_and_municipal'
          )
          and "nfse_settings"."issqn_taxation" = 'taxable'
        )
      ))
);
--> statement-breakpoint
ALTER TABLE "nfse_settings" ADD CONSTRAINT "nfse_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;